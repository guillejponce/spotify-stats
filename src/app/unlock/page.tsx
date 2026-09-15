import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function UnlockPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const nextPath =
    typeof searchParams.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/";
  const showError = searchParams.error === "1";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-spotify-black px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green">
            <Music2 className="h-7 w-7 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white">Statsify</h1>
          <p className="mt-2 text-sm text-spotify-light-gray">
            App personal. Desbloqueá una vez; en el iPhone (ícono de inicio) y
            en el Mac queda recordado varios meses.
          </p>
        </div>

        <form
          action="/api/unlock"
          method="POST"
          className="rounded-xl border border-white/5 bg-spotify-dark-gray p-6 shadow-sm"
        >
          <input type="hidden" name="next" value={nextPath} />
          <label htmlFor="password" className="sr-only">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            placeholder="Contraseña"
            className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-base text-white outline-none placeholder:text-spotify-light-gray/60 focus:border-spotify-green focus:ring-2 focus:ring-spotify-green/40"
          />
          {showError && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              Contraseña incorrecta.
            </p>
          )}
          <Button type="submit" size="lg" className="mt-5 w-full">
            Desbloquear
          </Button>
        </form>
      </div>
    </div>
  );
}
