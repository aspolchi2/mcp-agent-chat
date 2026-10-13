import type { NextRequest } from "next/server";
import {
  MAX_DOC_LENGTH,
  VersionConflictError,
  readAgentDoc,
  resetAgentDoc,
  writeAgentDoc,
} from "@/lib/agent-doc";
import { requireReadAccess } from "@/lib/api-guard";
import { authRequired, unauthorized } from "@/lib/auth";
import { normalizeName } from "@/lib/chat";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ room: string; agent: string }> };

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Lee el `AGENTS.md` de un agente. Con `?format=md` devuelve el markdown crudo,
 * para poder hacer `curl ... > AGENTS.md` desde la máquina del agente.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  const denied = await requireReadAccess(request);
  if (denied) return denied;

  try {
    const { room, agent } = await ctx.params;
    const roomId = normalizeName(room);
    const agentId = normalizeName(agent);
    const { doc, isDefault } = await readAgentDoc(roomId, agentId);

    if (request.nextUrl.searchParams.get("format") === "md") {
      return new Response(doc.content, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "no-store",
          // Permite comprobar la versión sin parsear el markdown.
          "x-agent-doc-version": String(doc.version),
        },
      });
    }

    return Response.json({
      room: roomId,
      agent: agentId,
      content: doc.content,
      version: doc.version,
      updatedAt: isDefault ? null : doc.updatedAt,
      isDefault,
      authRequired: authRequired(),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Error desconocido", 500);
  }
}

/** Guarda el documento. Cuerpo: `{ content, expectedVersion? }`. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const denied = unauthorized(request);
  if (denied) return denied;

  try {
    const { room, agent } = await ctx.params;
    const roomId = normalizeName(room);
    const agentId = normalizeName(agent);

    const body = (await request.json()) as { content?: unknown; expectedVersion?: unknown };
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return fail("`content` es obligatorio y debe ser un markdown no vacío.", 400);
    }
    if (body.content.length > MAX_DOC_LENGTH) {
      return fail(`El documento supera los ${MAX_DOC_LENGTH} caracteres.`, 400);
    }

    const expectedVersion =
      typeof body.expectedVersion === "number" ? body.expectedVersion : undefined;

    const doc = await writeAgentDoc(roomId, agentId, body.content, expectedVersion);
    return Response.json({
      ok: true,
      room: doc.room,
      agent: doc.agent,
      version: doc.version,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return Response.json(
        { error: error.message, currentVersion: error.currentVersion },
        { status: 409 },
      );
    }
    return fail(error instanceof Error ? error.message : "Error desconocido", 500);
  }
}

/** Borra el documento guardado: vuelve a la plantilla por defecto. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const denied = unauthorized(request);
  if (denied) return denied;

  try {
    const { room, agent } = await ctx.params;
    await resetAgentDoc(normalizeName(room), normalizeName(agent));
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Error desconocido", 500);
  }
}
