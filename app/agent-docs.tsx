"use client";

import { useCallback, useEffect, useState } from "react";

type DocSummary = {
  agent: string;
  version: number;
  updatedAt: string | null;
  length: number;
};

type Doc = {
  agent: string;
  content: string;
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
  authRequired: boolean;
};

const TOKEN_KEY = "chat-mcp-token";

/**
 * Editor de los `AGENTS.md` de la sala.
 *
 * El servidor no puede escribir en el disco de las máquinas de los agentes: lo
 * que se guarda aquí es la copia canónica que cada agente lee con
 * `read_agent_doc` y aplica a su propio fichero.
 */
export function AgentDocsPanel({ room }: { room: string }) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [draft, setDraft] = useState("");
  // Inicialización perezosa: en el servidor no hay `localStorage`, y el input
  // que muestra el token sólo se renderiza tras cargar un documento (ya en el
  // cliente), así que no hay riesgo de desajuste de hidratación.
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem(TOKEN_KEY) ?? ""),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/docs`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la lista");
    setDocs(data.docs as DocSummary[]);
    return data.docs as DocSummary[];
  }, [room]);

  const loadDoc = useCallback(
    async (agent: string) => {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(room)}/docs/${encodeURIComponent(agent)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el documento");
      setDoc(data as Doc);
      setDraft(data.content as string);
    },
    [room],
  );

  // Sólo carga la lista: el documento abierto no se refresca solo para no pisar
  // lo que el usuario esté escribiendo. Al cambiar de sala, `page.tsx` remonta
  // este componente con `key`, así que no hace falta limpiar el estado a mano.
  useEffect(() => {
    async function load() {
      try {
        await loadList();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    }

    void load();
  }, [room, loadList]);

  async function open(agent: string) {
    setSelected(agent);
    setStatus(null);
    setError(null);
    try {
      await loadDoc(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function authHeaders(): HeadersInit {
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  function rememberToken(value: string) {
    setToken(value);
    localStorage.setItem(TOKEN_KEY, value);
  }

  async function save() {
    if (!doc) return;
    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(room)}/docs/${encodeURIComponent(doc.agent)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ content: draft, expectedVersion: doc.version }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.message ?? "No se pudo guardar");

      setStatus(`Guardado (versión ${data.version}).`);
      await Promise.all([loadDoc(doc.agent), loadList()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!doc) return;
    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(room)}/docs/${encodeURIComponent(doc.agent)}`,
        { method: "DELETE", headers: authHeaders() },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo restablecer");

      setStatus("Restablecido a la plantilla por defecto.");
      await Promise.all([loadDoc(doc.agent), loadList()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  const dirty = doc !== null && draft !== doc.content;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {error && (
        <p className="rounded border border-red-500/60 bg-red-500/10 p-3 text-sm">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {docs.length === 0 ? (
          <p className="text-sm opacity-60">
            Todavía no hay agentes en esta sala. En cuanto uno haga <code>join_chat</code>{" "}
            aparecerá aquí con su plantilla por defecto.
          </p>
        ) : (
          docs.map((d) => (
            <button
              key={d.agent}
              type="button"
              onClick={() => open(d.agent)}
              className={`rounded border px-3 py-1.5 text-sm transition ${
                selected === d.agent
                  ? "border-foreground/40 bg-foreground/10 font-medium"
                  : "border-foreground/15 hover:bg-foreground/5"
              }`}
            >
              <span className="font-mono">{d.agent}</span>
              <span className="ml-2 text-xs opacity-60">
                {d.version === 0 ? "plantilla" : `v${d.version}`}
              </span>
            </button>
          ))
        )}
      </div>

      {doc && (
        <div className="flex flex-1 flex-col gap-3">
          <p className="text-xs opacity-70">
            {doc.isDefault
              ? "Nadie ha guardado este documento: estás viendo la plantilla por defecto."
              : `Versión ${doc.version} · actualizado ${
                  doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "—"
                }`}
            {" · "}
            <a
              className="underline"
              href={`/api/rooms/${encodeURIComponent(room)}/docs/${encodeURIComponent(
                doc.agent,
              )}?format=md`}
              target="_blank"
              rel="noreferrer"
            >
              markdown crudo
            </a>
          </p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="min-h-[24rem] flex-1 rounded border border-foreground/15 bg-transparent p-3 font-mono text-xs leading-relaxed"
          />

          {doc.authRequired && (
            <label className="flex items-center gap-2 text-xs opacity-80">
              <span className="shrink-0">Token (MCP_AUTH_TOKEN):</span>
              <input
                type="password"
                value={token}
                onChange={(e) => rememberToken(e.target.value)}
                placeholder="Bearer token para poder guardar"
                className="flex-1 rounded border border-foreground/15 bg-transparent px-2 py-1 font-mono"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(doc.content)}
              disabled={busy || !dirty}
              className="rounded border border-foreground/20 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || doc.isDefault}
              className="rounded border border-foreground/20 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Volver a la plantilla
            </button>
            {status && <span className="text-xs opacity-70">{status}</span>}
            {dirty && !status && <span className="text-xs opacity-70">Sin guardar</span>}
          </div>

          <p className="text-xs opacity-60">
            Lo que guardes aquí lo leen los agentes con <code>read_agent_doc</code> y lo
            copian a su <code>AGENTS.md</code> local. Trátalo como instrucciones que van a
            ejecutar: revisa siempre lo que escribió otro antes de aplicarlo.
          </p>
        </div>
      )}
    </div>
  );
}
