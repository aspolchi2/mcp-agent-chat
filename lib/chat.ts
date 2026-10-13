import type { ChangeStream, ChangeStreamInsertDocument, Collection, Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";

export type ChatMessage = {
  room: string;
  agent: string;
  text: string;
  /** Contador monótono por sala. Sirve como cursor de lectura. */
  seq: number;
  createdAt: Date;
};

export type Participant = {
  room: string;
  agent: string;
  description?: string;
  joinedAt: Date;
  lastSeenAt: Date;
};

export const MAX_TEXT_LENGTH = 20_000;

/** Normaliza nombres de sala y de agente para que `Sala 1` y `sala-1` no se dupliquen. */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Reserva el siguiente número de secuencia de la sala.
 *
 * Se usa un contador atómico en vez de ordenar por fecha porque dos agentes
 * pueden escribir en el mismo milisegundo, y el cursor de lectura necesita un
 * orden total sin empates.
 */
async function nextSeq(room: string): Promise<number> {
  const db = await getDb();
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: room },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );

  if (!counter) throw new Error(`No se pudo reservar el número de mensaje en "${room}".`);
  return counter.seq;
}

export async function joinRoom(
  room: string,
  agent: string,
  description?: string,
): Promise<{ participants: Participant[]; cursor: number }> {
  const db = await getDb();
  const now = new Date();

  await db.collection<Participant>("participants").updateOne(
    { room, agent },
    {
      $set: { lastSeenAt: now, ...(description ? { description } : {}) },
      $setOnInsert: { room, agent, joinedAt: now },
    },
    { upsert: true },
  );

  const [participants, cursor] = await Promise.all([
    listParticipants(room),
    latestSeq(room),
  ]);

  return { participants, cursor };
}

export async function touchParticipant(room: string, agent: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db.collection<Participant>("participants").updateOne(
    { room, agent },
    { $set: { lastSeenAt: now }, $setOnInsert: { room, agent, joinedAt: now } },
    { upsert: true },
  );
}

export async function sendMessage(
  room: string,
  agent: string,
  text: string,
): Promise<ChatMessage> {
  const db = await getDb();
  const seq = await nextSeq(room);
  const message: ChatMessage = { room, agent, text, seq, createdAt: new Date() };

  await db.collection<ChatMessage>("messages").insertOne(message);
  await touchParticipant(room, agent);

  return message;
}

export async function readMessages(
  room: string,
  options: { after?: number; limit?: number } = {},
): Promise<{ messages: ChatMessage[]; cursor: number }> {
  const db = await getDb();
  const after = options.after ?? 0;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  const messages = await db
    .collection<ChatMessage>("messages")
    .find({ room, seq: { $gt: after } }, { projection: { _id: 0 } })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();

  // El cursor sólo avanza hasta lo que devolvimos: si el límite truncó el
  // resultado, la siguiente llamada retoma exactamente donde quedó.
  const cursor = messages.length > 0 ? messages[messages.length - 1].seq : after;

  return { messages, cursor };
}

type WaitOptions = {
  after: number;
  excludeAgent?: string;
  timeoutMs: number;
  pollIntervalMs?: number;
};

type WaitResult = { messages: ChatMessage[]; cursor: number; timedOut: boolean };

function pendingFilter(room: string, options: WaitOptions): Filter<ChatMessage> {
  const filter: Filter<ChatMessage> = { room, seq: { $gt: options.after } };
  if (options.excludeAgent) filter.agent = { $ne: options.excludeAgent };
  return filter;
}

function found(messages: ChatMessage[]): WaitResult {
  return { messages, cursor: messages[messages.length - 1].seq, timedOut: false };
}

/** Los mensajes pendientes para este cursor, en orden. Vacío si no hay nada nuevo. */
async function pending(
  messages: Collection<ChatMessage>,
  room: string,
  options: WaitOptions,
): Promise<ChatMessage[]> {
  return messages
    .find(pendingFilter(room, options), { projection: { _id: 0 } })
    .sort({ seq: 1 })
    .limit(50)
    .toArray();
}

/** Espera consultando cada segundo. Sólo se usa si el change stream no está disponible. */
async function waitByPolling(
  messages: Collection<ChatMessage>,
  room: string,
  options: WaitOptions,
  deadline: number,
): Promise<WaitResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 1000;

  for (;;) {
    if (Date.now() + pollIntervalMs >= deadline) {
      return { messages: [], cursor: options.after, timedOut: true };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const batch = await pending(messages, room, options);
    if (batch.length > 0) return found(batch);
  }
}

/**
 * Espera hasta que aparezca un mensaje posterior a `after`.
 *
 * Escucha el change stream de la colección, así que despierta en cuanto se
 * inserta el mensaje en vez de consultar en bucle. Los change streams necesitan
 * un replica set (Atlas lo es); si no están disponibles cae a polling.
 *
 * Por defecto ignora los mensajes del propio agente: sin eso, un agente que
 * acaba de escribir se despertaría de inmediato con su propio mensaje.
 */
export async function waitForMessage(
  room: string,
  options: WaitOptions,
): Promise<WaitResult> {
  const db = await getDb();
  const collection = db.collection<ChatMessage>("messages");
  const deadline = Date.now() + options.timeoutMs;

  let stream: ChangeStream<ChatMessage, ChangeStreamInsertDocument<ChatMessage>> | null = null;

  try {
    // El stream se abre ANTES de la consulta inicial: así, un mensaje que se
    // inserte mientras consultamos queda en el buffer del stream en vez de
    // caer en el hueco entre ambas operaciones.
    stream = collection.watch<ChatMessage, ChangeStreamInsertDocument<ChatMessage>>([
      { $match: { operationType: "insert", "fullDocument.room": room } },
    ]);
  } catch {
    return waitByPolling(collection, room, options, deadline);
  }

  try {
    const initial = await pending(collection, room, options);
    if (initial.length > 0) return found(initial);

    const outcome = await new Promise<"insert" | "timeout" | "error">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), Math.max(deadline - Date.now(), 0));
      const settle = (value: "insert" | "timeout" | "error") => {
        clearTimeout(timer);
        resolve(value);
      };

      stream!.on("change", (change) => {
        const doc = change.fullDocument;
        if (!doc) return;
        if (doc.seq <= options.after) return;
        if (options.excludeAgent && doc.agent === options.excludeAgent) return;
        settle("insert");
      });
      // Un stream que se rompe a media espera (failover, permisos) no debe
      // agotar el tiempo en silencio: se termina la espera por polling.
      stream!.on("error", () => settle("error"));
    });

    if (outcome === "timeout") {
      return { messages: [], cursor: options.after, timedOut: true };
    }

    // Se releen desde Mongo en vez de usar el documento del evento: puede haber
    // llegado más de uno, y así el orden por `seq` es el mismo que en read_messages.
    const batch = await pending(collection, room, options);
    if (batch.length > 0) return found(batch);

    if (outcome === "error") return waitByPolling(collection, room, options, deadline);
    return { messages: [], cursor: options.after, timedOut: true };
  } finally {
    await stream?.close().catch(() => {});
  }
}

export async function latestSeq(room: string): Promise<number> {
  const db = await getDb();
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOne({ _id: room });
  return counter?.seq ?? 0;
}

export async function listParticipants(room: string): Promise<Participant[]> {
  const db = await getDb();
  return db
    .collection<Participant>("participants")
    .find({ room }, { projection: { _id: 0 } })
    .sort({ joinedAt: 1 })
    .toArray();
}

export async function listRooms(): Promise<
  { room: string; messageCount: number; participants: string[]; lastActivityAt: Date | null }[]
> {
  const db = await getDb();

  const rooms = await db
    .collection<ChatMessage>("messages")
    .aggregate<{ _id: string; messageCount: number; lastActivityAt: Date }>([
      {
        $group: {
          _id: "$room",
          messageCount: { $sum: 1 },
          lastActivityAt: { $max: "$createdAt" },
        },
      },
      { $sort: { lastActivityAt: -1 } },
      { $limit: 100 },
    ])
    .toArray();

  return Promise.all(
    rooms.map(async (r) => ({
      room: r._id,
      messageCount: r.messageCount,
      lastActivityAt: r.lastActivityAt ?? null,
      participants: (await listParticipants(r._id)).map((p) => p.agent),
    })),
  );
}
