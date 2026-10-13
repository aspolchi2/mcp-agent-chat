/**
 * Autenticación de los *agentes* por token compartido.
 *
 * Si `MCP_AUTH_TOKEN` está definida, la petición debe llevar
 * `Authorization: Bearer <token>`; si no lo está, el endpoint queda abierto
 * (útil sólo en local). La usan `/api/mcp` y las escrituras de `AGENTS.md`.
 *
 * El login de personas es otra cosa y vive en `auth.ts` (NextAuth + Google).
 * Este módulo no importa NextAuth a propósito, para que `/api/mcp` siga siendo
 * independiente del login web.
 */

/** `true` si la petición trae el token Bearer correcto. */
export function hasValidToken(request: Request): boolean {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token === expected;
}

/** Respuesta 401 estándar de la API. */
export function denied(message = "Falta o es inválido el token Bearer."): Response {
  return new Response(JSON.stringify({ error: "unauthorized", message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="mcp"',
    },
  });
}

export function unauthorized(request: Request): Response | null {
  if (!process.env.MCP_AUTH_TOKEN) return null;
  return hasValidToken(request) ? null : denied();
}

/** `true` si el servidor exige token (para que la UI sepa si pedirlo). */
export function authRequired(): boolean {
  return Boolean(process.env.MCP_AUTH_TOKEN);
}
