import { Music2 } from "lucide-react";
import { LoginHashError } from "@/components/auth/login-hash-error";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  oauth_start: "No se pudo iniciar el login. Intenta de nuevo.",
  oauth_denied: "Cancelaste o se rechazó el acceso.",
  no_code: "No llegó el código de acceso.",
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
            href={`/api/auth/google?next=${encodeURIComponent(nextPath)}`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black transition-colors hover:bg-white/90"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Entrar con Google
          </a>
          <div className="my-4 flex items-center gap-3 text-xs text-spotify-light-gray">
            <span className="h-px flex-1 bg-white/10" />o<span className="h-px flex-1 bg-white/10" />
          </div>
          <a
            href={`/api/spotify/auth?next=${encodeURIComponent(nextPath)}`}
            className="flex h-12 w-full items-center justify-center rounded-full border border-spotify-green/60 text-base font-semibold text-spotify-green transition-colors hover:bg-spotify-green/10"
          >
            Entrar con Spotify
          </a>
          <p className="mt-3 text-center text-xs text-spotify-light-gray">
            Spotify solo funciona si el admin te dio un cupo. Si no, entra con Google y te guiamos para conectar
            tu música.
          </p>
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
