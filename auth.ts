/**
 * Login de la web con NextAuth v5 (Auth.js) + Google.
 *
 * Ojo: esto es el login *humano* de la interfaz. La autenticación de los
 * agentes MCP es otra cosa y sigue viviendo en `lib/auth.ts` (token Bearer).
 *
 * Sólo entran los mails listados en `lib/allowed-emails.ts`. La lista está en el
 * repo (no en una variable de entorno) y es una puerta de seguridad: si se queda
 * vacía no entra nadie.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/allowed-emails";

export { isAllowedEmail };

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Un mail no permitido acaba en /login?error=AccessDenied en vez de en la
    // página de error genérica de Auth.js.
    error: "/login",
  },
  callbacks: {
    signIn({ profile }) {
      // Google marca `email_verified`; sin eso el mail no prueba nada.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      return verified === true && isAllowedEmail(profile?.email);
    },
  },
});
