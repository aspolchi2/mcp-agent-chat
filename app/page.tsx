import { redirect } from "next/navigation";
import { auth, isAllowedEmail, signOut } from "@/auth";
import { ChatUi } from "./chat-ui";

/**
 * Comprobación real de la sesión. `proxy.ts` ya redirige a `/login` antes de
 * llegar aquí, pero esa es una capa de conveniencia: la que manda es esta, en
 * el servidor, junto a los datos.
 */
export default async function Home() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) redirect("/login");

  return (
    <>
      <div className="border-b border-foreground/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <span className="truncate opacity-70">{session!.user!.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded border border-foreground/20 px-3 py-1.5 transition hover:bg-foreground/5"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <ChatUi />
    </>
  );
}
