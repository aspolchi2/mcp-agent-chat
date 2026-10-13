"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentDocsPanel } from "./agent-docs";

type Tab = "messages" | "docs";

type RoomSummary = {
  room: string;
  messageCount: number;
  participants: string[];
  lastActivityAt: string | null;
};

type Message = {
  room: string;
  agent: string;
  text: string;
  seq: number;
  createdAt: string;
};

const AGENT_COLORS = [
  "border-sky-500/60 bg-sky-500/10",
  "border-emerald-500/60 bg-emerald-500/10",
  "border-violet-500/60 bg-violet-500/10",
  "border-amber-500/60 bg-amber-500/10",
];

function agentColor(agent: string, agents: string[]): string {
  const index = agents.indexOf(agent);
  return AGENT_COLORS[(index < 0 ? 0 : index) % AGENT_COLORS.length];
}

const MAX_LINES = 20;

function MessageText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 0;
      if (!lineHeight) return;
      setOverflows(node.scrollHeight > lineHeight * MAX_LINES + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <p
        ref={ref}
        className={`whitespace-pre-wrap text-sm ${expanded ? "" : "line-clamp-20"}`}
      >
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-xs font-medium underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          {expanded ? "Contraer mensaje" : "Expandir mensaje"}
        </button>
      )}
    </>
  );
}

export function ChatUi() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("messages");

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las salas");
    setRooms(data.rooms);
    return data.rooms as RoomSummary[];
  }, []);

  const loadMessages = useCallback(async (room: string) => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los mensajes");
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const list = await loadRooms();
        if (cancelled) return;

        const room = selected ?? list[0]?.room ?? null;
        if (room !== selected) setSelected(room);
        if (room) await loadMessages(room);
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error desconocido");
      }
    }

    void tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, loadRooms, loadMessages]);

  const agents = [...new Set(messages.map((m) => m.agent))];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Sala de chat MCP</h1>
        <p className="text-sm opacity-70">
          Visor en vivo de las conversaciones entre agentes y editor de sus{" "}
          <code className="font-mono">AGENTS.md</code>. El servidor MCP está en{" "}
          <code className="font-mono">/api/mcp</code>.
        </p>
      </header>

      {error && (
        <p className="rounded border border-red-500/60 bg-red-500/10 p-3 text-sm">{error}</p>
      )}

      <div className="flex flex-1 flex-col gap-6 sm:flex-row">
        <aside className="sm:w-56 sm:shrink-0">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
            Salas
          </h2>
          {rooms.length === 0 ? (
            <p className="text-sm opacity-60">Todavía no hay ninguna sala.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rooms.map((room) => (
                <li key={room.room}>
                  <button
                    type="button"
                    onClick={() => setSelected(room.room)}
                    className={`w-full rounded px-3 py-2 text-left text-sm transition ${
                      selected === room.room
                        ? "bg-foreground/10 font-medium"
                        : "hover:bg-foreground/5"
                    }`}
                  >
                    <span className="block truncate">{room.room}</span>
                    <span className="block text-xs opacity-60">
                      {room.messageCount} mensajes · {room.participants.length} agentes
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex flex-1 flex-col gap-4">
          <nav className="flex gap-1 border-b border-foreground/10 text-sm">
            {(
              [
                ["messages", "Mensajes"],
                ["docs", "AGENTS.md"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 py-1.5 transition ${
                  tab === id
                    ? "border-foreground font-medium"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "docs" ? (
            selected ? (
              <AgentDocsPanel key={selected} room={selected} />
            ) : (
              <p className="text-sm opacity-60">Selecciona una sala.</p>
            )
          ) : messages.length === 0 ? (
            <p className="text-sm opacity-60">
              {selected
                ? "La sala está vacía. Esperando el primer mensaje…"
                : "Conecta un agente al servidor MCP para empezar."}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {[...messages].reverse().map((message) => (
                <li
                  key={message.seq}
                  className={`rounded-lg border p-3 ${agentColor(message.agent, agents)}`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs opacity-70">
                    <span className="font-mono font-medium">{message.agent}</span>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  <MessageText text={message.text} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
