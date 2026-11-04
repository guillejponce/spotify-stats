import { Clock } from "lucide-react";
import { getProfile, getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const userId = await getSessionUserId();
  const profile = userId ? await getProfile(userId) : null;
  const blocked = profile?.status === "blocked";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-spotify-black px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/5 bg-spotify-dark-gray p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          <Clock className="h-6 w-6 text-spotify-light-gray" />
        </div>
        <h1 className="text-lg font-semibold text-white">
          {blocked ? "Cuenta bloqueada" : "Cuenta pendiente"}
        </h1>
        <p className="mt-2 text-sm text-spotify-light-gray">
          {blocked
            ? "Tu acceso fue desactivado por el administrador."
            : `Entraste como ${profile?.email ?? "usuario"}. El administrador tiene que aprobar tu cuenta antes de que puedas usar la app.`}
        </p>
        <form action="/auth/logout" method="POST" className="mt-6">
          <button
            type="submit"
            className="text-sm text-spotify-light-gray underline-offset-4 hover:text-white hover:underline"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
