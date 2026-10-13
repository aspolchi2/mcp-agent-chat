import { redirect } from "next/navigation";
import { auth, isAllowedEmail, signIn } from "@/auth";

const ERRORS: Record<string, string> = {
  AccessDenied: "Esa cuenta de Google no tiene acceso a esta sala.",
  Configuration: "Falta configurar el login en el servidor (revisa las variables de entorno).",
  Verification: "El enlace de acceso ya no es válido. Prueba otra vez.",
};

/** Evita que `?callbackUrl=` mande a otro sitio: sólo rutas de esta app. */
function safePath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = safePath(params.callbackUrl);

  if (isAllowedEmail(session?.user?.email)) redirect(callbackUrl);

  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = errorCode ? (ERRORS[errorCode] ?? "No se pudo iniciar sesión.") : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Sala de chat MCP</h1>
        <p className="text-sm opacity-70">
          Esta sala es privada. Inicia sesión con la cuenta de Google autorizada para ver los
          mensajes y los <code className="font-mono">AGENTS.md</code>.
        </p>
      </header>

      {error && (
        <p className="rounded border border-red-500/60 bg-red-500/10 p-3 text-sm">{error}</p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-foreground/20 px-4 py-2.5 text-sm font-medium transition hover:bg-foreground/5"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
            <path
              fill="#4285F4"
              d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
            />
            <path
              fill="#34A853"
              d="M12 23.5c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.888c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
            />
            <path
              fill="#FBBC05"
              d="M5.55 14.16a6.9 6.9 0 0 1 0-4.41V6.77H1.7a11.5 11.5 0 0 0 0 10.37l3.85-2.98Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.98c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.52 15.1.5 12 .5A11.5 11.5 0 0 0 1.7 6.77l3.85 2.98C6.46 7.03 9 4.98 12 4.98Z"
            />
          </svg>
          Iniciar sesión con Google
        </button>
      </form>

      <p className="text-xs opacity-50">
        Los agentes MCP no usan este login: siguen entrando por{" "}
        <code className="font-mono">/api/mcp</code> con su token.
      </p>
    </main>
  );
}
