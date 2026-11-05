"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, ListChecks } from "lucide-react";

type LightStatus = {
  loginProvider: string | null;
  spotify: { connected: boolean; needsReconnect: boolean };
  lastfm: { connected: boolean };
  history: { imported: boolean };
};

/** Avisos globales: Spotify vencido o cuenta sin fuente de canciones nuevas. */
export function SetupBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<LightStatus | null>(null);

  useEffect(() => {
    fetch("/api/onboarding?light=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [pathname === "/welcome"]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status || pathname === "/welcome") return null;

  if (status.spotify.needsReconnect && !status.lastfm.connected) {
    const href =
      status.loginProvider === "spotify" ? "/api/spotify/auth?next=/" : "/api/spotify/connect";
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 text-sm text-yellow-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-300" />
          Tu conexión con Spotify venció (Spotify la corta cada 6 meses). Reconéctala para que sigan llegando tus
          canciones.
        </div>
        <a
          href={href}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-spotify-green px-4 text-xs font-medium text-black"
        >
          Reconectar Spotify
        </a>
      </div>
    );
  }

  if (!status.spotify.connected && !status.lastfm.connected) {
    return (
      <Link
        href="/welcome"
        className="mb-6 flex items-center gap-3 rounded-xl border border-spotify-green/30 bg-spotify-green/10 p-4 text-sm text-white hover:bg-spotify-green/15"
      >
        <ListChecks className="h-5 w-5 shrink-0 text-spotify-green" />
        <span>
          <strong>Termina de configurar tu cuenta</strong> para que Statsify vea lo que escuchas. Son unos
          pocos pasos.
        </span>
      </Link>
    );
  }

  return null;
}
