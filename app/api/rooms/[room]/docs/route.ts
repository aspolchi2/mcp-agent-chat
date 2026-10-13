import { requireReadAccess } from "@/lib/api-guard";
import { authRequired } from "@/lib/auth";
import { listAgentDocs } from "@/lib/agent-doc";
import { listParticipants, normalizeName } from "@/lib/chat";

export const runtime = "nodejs";

/**
 * Lista los `AGENTS.md` de la sala. Incluye a los participantes que todavía no
 * guardaron nada (`version: 0`), porque para ellos hay una plantilla por defecto.
 */
export async function GET(request: Request, ctx: { params: Promise<{ room: string }> }) {
  const denied = await requireReadAccess(request);
  if (denied) return denied;

  try {
    const { room } = await ctx.params;
    const roomId = normalizeName(room);

    const [docs, participants] = await Promise.all([
      listAgentDocs(roomId),
      listParticipants(roomId),
    ]);

    const byAgent = new Map(docs.map((d) => [d.agent, d]));
    for (const p of participants) {
      if (!byAgent.has(p.agent)) {
        byAgent.set(p.agent, { agent: p.agent, version: 0, updatedAt: new Date(0), length: 0 });
      }
    }

    return Response.json({
      room: roomId,
      authRequired: authRequired(),
      docs: [...byAgent.values()]
        .sort((a, b) => a.agent.localeCompare(b.agent))
        .map((d) => ({
          agent: d.agent,
          version: d.version,
          updatedAt: d.version === 0 ? null : d.updatedAt,
          length: d.length,
        })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
