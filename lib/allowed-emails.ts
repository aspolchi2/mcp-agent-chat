/**
 * Quién puede entrar a la web.
 *
 * La lista vive aquí, en el repo, y no en una variable de entorno: así invitar
 * a alguien es un commit (queda registrado en el historial y no hace falta
 * tocar la configuración de Vercel ni acordarse de replicarla en local).
 *
 * A cambio, los mails son públicos si el repositorio lo es. Tenlo en cuenta
 * antes de añadir el de otra persona.
 *
 * Para invitar a alguien: añade su mail abajo y despliega.
 */
export const ALLOWED_EMAILS: readonly string[] = [
  // "tu-mail@gmail.com",
];

const allowed = new Set<string>(ALLOWED_EMAILS.map((email) => email.trim().toLowerCase()));

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowed.has(email.trim().toLowerCase());
}
