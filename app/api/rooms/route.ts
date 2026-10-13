import { requireReadAccess } from "@/lib/api-guard";
import { listRooms } from "@/lib/chat";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requireReadAccess(request);
  if (denied) return denied;

  try {
    return Response.json({ rooms: await listRooms() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
