/**
 * Puerta de entrada de la web: sin sesión no se ve ninguna página.
 *
 * `proxy.ts` es el nombre nuevo de lo que antes era `middleware.ts` (renombrado
 * en Next.js 16). Corre en el runtime de Node, así que aquí se puede validar el
 * JWT de la sesión de verdad, no sólo mirar si existe la cookie.
 *
 * Las rutas `/api/*` quedan fuera a propósito: cada handler decide si acepta
 * sesión web, token Bearer de agente, o ambos.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((request) => {
  if (request.auth?.user) return NextResponse.next();

  const login = new URL("/login", request.nextUrl.origin);
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from !== "/") login.searchParams.set("callbackUrl", from);

  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    /*
     * Todo menos:
     * - api        (los handlers se protegen solos)
     * - login      (si no, bucle de redirecciones)
     * - _next/*    (estáticos y optimización de imágenes)
     * - favicon.ico
     */
    "/((?!api|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
