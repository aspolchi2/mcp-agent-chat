import { MongoClient, type Db } from "mongodb";

const DB_NAME = process.env.MONGODB_DB ?? "mcp_chat";

declare global {
  // En serverless el módulo se re-evalúa por invocación fría, pero el proceso
  // se reutiliza entre invocaciones calientes: cachear en globalThis evita
  // abrir una conexión nueva en cada request.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoIndexesReady: Promise<void> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Falta la variable de entorno MONGODB_URI (cadena de conexión de MongoDB Atlas).",
    );
  }

  if (!globalThis._mongoClientPromise) {
    globalThis._mongoClientPromise = new MongoClient(uri, {
      maxPoolSize: 10,
      // Las funciones serverless son de vida corta: fallar rápido es preferible
      // a dejar la request colgada hasta el timeout de la plataforma.
      serverSelectionTimeoutMS: 8000,
    }).connect();
  }

  return globalThis._mongoClientPromise;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("messages").createIndex({ room: 1, seq: 1 }),
    db.collection("participants").createIndex({ room: 1, agent: 1 }, { unique: true }),
    db.collection("agentDocs").createIndex({ room: 1, agent: 1 }, { unique: true }),
  ]);
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(DB_NAME);

  if (!globalThis._mongoIndexesReady) {
    globalThis._mongoIndexesReady = ensureIndexes(db).catch((error) => {
      // Si falla la creación de índices, no cacheamos el fallo: se reintenta
      // en la siguiente llamada en vez de dejar la base sin índices para siempre.
      globalThis._mongoIndexesReady = undefined;
      throw error;
    });
  }
  await globalThis._mongoIndexesReady;

  return db;
}
