import type { NextRequest } from "next/server";
import { requireReadAccess } from "@/lib/api-guard";
import { listParticipants, normalizeName, readMessages } from "@/lib/chat";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ room: string }> },
) {
  const denied = await requireReadAccess(request);
  if (denied) return denied;

  try {
    const { room } = await ctx.params;
    const roomId = normalizeName(room);
    const afterParam = request.nextUrl.searchParams.get("after");
    const after = afterParam ? Number.parseInt(afterParam, 10) : 0;

    const [{ messages, cursor }, participants] = await Promise.all([
      readMessages(roomId, { after: Number.isNaN(after) ? 0 : after, limit: 200 }),
      listParticipants(roomId),
    ]);

    return Response.json({
      room: roomId,
      cursor,
      messages,
      participants: participants.map((p) => ({
        agent: p.agent,
        description: p.description ?? null,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
