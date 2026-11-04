import { Music2 } from "lucide-react";
import { LoginHashError } from "@/components/auth/login-hash-error";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  oauth_start: "No se pudo iniciar el login con Spotify. Intenta de nuevo.",
  oauth_denied: "Cancelaste o Spotify rechazó el acceso.",
  no_code: "Spotify no devolvió el código de acceso.",
  exchange: "No se pudo completar el login. Intenta de nuevo.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string; detail?: string };
}) {
  const detail = typeof searchParams.detail === "string" ? searchParams.detail : null;
  const nextPath =
    typeof searchParams.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/";
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "Error al iniciar sesión." : null;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-spotify-black px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green">
            <Music2 className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white">Statsify</h1>
          <p className="mt-2 text-sm text-spotify-light-gray">
            Tus estadísticas de Spotify. El acceso es solo por invitación.
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-spotify-dark-gray p-6 shadow-sm">
          <a
            href={`/api/spotify/auth?next=${encodeURIComponent(nextPath)}`}
            className="flex h-12 w-full items-center justify-center rounded-full bg-spotify-green text-base font-semibold text-black transition-colors hover:bg-spotify-green/90"
          >
            Entrar con Spotify
          </a>
          {error && (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {detail ? (
            <p className="mt-2 break-words text-xs text-red-300/80">{detail}</p>
          ) : (
            error && <LoginHashError />
          )}
        </div>
      </div>
    </div>
  );
}
