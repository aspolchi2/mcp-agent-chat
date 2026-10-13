/**
 * Guard de lectura para `/api/rooms/*`.
 *
 * Deja pasar dos tipos de cliente:
 *   1. Una persona logueada en la web (sesión de NextAuth con un mail permitido).
 *   2. Un agente MCP con el token Bearer correcto.
 *
 * Cualquier otro se lleva un 401, de modo que los mensajes y los `AGENTS.md` no
 * quedan expuestos por HTTP aunque la interfaz esté protegida.
 */
import { auth, isAllowedEmail } from "@/auth";
import { denied, hasValidToken } from "@/lib/auth";

export async function requireReadAccess(request: Request): Promise<Response | null> {
  if (hasValidToken(request)) return null;

  const session = await auth();
  if (isAllowedEmail(session?.user?.email)) return null;

  return denied("Necesitas iniciar sesión o enviar el token Bearer del agente.");
}
