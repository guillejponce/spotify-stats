"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  History,
  Loader2,
  Radio,
  RefreshCw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = {
  loginProvider: string | null;
  lastfmConfigured: boolean;
  spotify: { connected: boolean; needsReconnect: boolean };
  lastfm:
    | { connected: false }
    | {
        connected: true;
        username: string;
        lastSyncedAt: string | null;
        lastError: string | null;
        latestScrobbleAt: string | null;
        receiving: boolean;
      };
  history: { imported: boolean; lastImportAt: string | null };
};

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  "lastfm:ok": { tone: "ok", text: "Last.fm quedó conectado." },
  "lastfm:denied": { tone: "error", text: "No se autorizó Last.fm. Puedes intentarlo de nuevo." },
  "lastfm:taken": {
    tone: "error",
    text: "Esa cuenta de Last.fm ya está conectada a otra persona en Statsify.",
  },
  "lastfm:error": { tone: "error", text: "No se pudo conectar Last.fm. Intenta de nuevo en un rato." },
  "lastfm:not_configured": {
    tone: "error",
    text: "Last.fm todavía no está configurado en Statsify. Avísale al admin.",
  },
  "spotify:ok": { tone: "ok", text: "Spotify quedó conectado: tus canciones se sincronizan solas." },
  "spotify:not_allowed": {
    tone: "error",
    text: "Spotify rechazó la conexión: tu cuenta no está en la lista de la app. Pídele un cupo al admin o usa Last.fm.",
  },
  "spotify:denied": { tone: "error", text: "No se autorizó Spotify." },
  "spotify:error": { tone: "error", text: "No se pudo conectar Spotify. Intenta de nuevo." },
};

const MANUAL_KEY = "statsify:onboarding";

function useManualChecks() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setChecks(JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "{}"));
    } catch {
      setChecks({});
    }
  }, []);
  const toggle = (key: string) =>
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(MANUAL_KEY, JSON.stringify(next));
      return next;
    });
  return { checks, toggle };
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-spotify-green hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Step({
  n,
  title,
  why,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  why: string;
  done: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        done ? "border-spotify-green/30 bg-spotify-green/5" : "border-white/5 bg-spotify-dark-gray",
        disabled && "opacity-50"
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            done ? "bg-spotify-green text-black" : "bg-white/10 text-white"
          )}
        >
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-sm text-spotify-light-gray">{why}</p>
          {children && <div className="mt-3 space-y-3 text-sm text-spotify-light-gray">{children}</div>}
        </div>
      </div>
    </li>
  );
}

function ManualCheck({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-white">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-[#1DB954]"
      />
      {label}
    </label>
  );
}

export function WelcomeChecklist() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { checks, toggle } = useManualChecks();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checkNow = async () => {
    setChecking(true);
    try {
      await fetch("/api/lastfm", { method: "POST" });
      await load();
    } finally {
      setChecking(false);
    }
  };

  const disconnectLastfm = async () => {
    await fetch("/api/lastfm", { method: "DELETE" });
    await load();
  };

  const noticeKey = ["lastfm", "spotify"]
    .map((k) => (params.get(k) ? `${k}:${params.get(k)}` : null))
    .find(Boolean);
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  if (!status) {
    return error ? (
      <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
    ) : (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const spotifyLive = status.spotify.connected && !status.spotify.needsReconnect;
  const lastfm = status.lastfm.connected ? status.lastfm : null;
  const reconnectHref =
    status.loginProvider === "spotify" ? "/api/spotify/auth?next=/welcome" : "/api/spotify/connect";

  const stepRequested = status.history.imported || Boolean(checks.zipRequested);
  const stepAccount = Boolean(lastfm) || Boolean(checks.lastfmAccount);
  const stepConnected = Boolean(lastfm);
  const stepReceiving = Boolean(lastfm?.receiving);
  const stepImported = status.history.imported;

  const steps = spotifyLive
    ? [stepRequested, stepImported]
    : [stepRequested, stepAccount, stepConnected, stepReceiving, stepImported];
  const doneCount = steps.filter(Boolean).length;
  const allDone = doneCount === steps.length;
  const liveReady = spotifyLive || stepReceiving;

  return (
    <div className="space-y-6">
      {notice && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            notice.tone === "ok" ? "bg-spotify-green/10 text-spotify-green" : "bg-red-500/10 text-red-300"
          )}
          role="status"
        >
          {notice.text}
        </p>
      )}

      {status.spotify.needsReconnect && (
        <div className="flex flex-col gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-300" />
            <p className="text-sm text-yellow-100">
              Tu conexión con Spotify venció. Spotify la corta cada 6 meses; reconéctala para que sigan
              llegando tus canciones.
            </p>
          </div>
          <a href={reconnectHref} className={buttonVariants({ size: "sm" })}>
            Reconectar Spotify
          </a>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-spotify-dark-gray p-4 ring-1 ring-white/5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <History className="h-4 w-4 text-spotify-green" /> Lo que escuchaste hasta hoy
          </div>
          <p className="text-sm text-spotify-light-gray">
            Viene de un archivo que le pides a Spotify y subes acá una sola vez.
          </p>
        </div>
        <div className="rounded-xl bg-spotify-dark-gray p-4 ring-1 ring-white/5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Radio className="h-4 w-4 text-spotify-green" /> Lo que escuches desde ahora
          </div>
          <p className="text-sm text-spotify-light-gray">
            {spotifyLive
              ? "Llega solo desde Spotify: ya está conectado."
              : "Llega solo a través de Last.fm, una app gratis que anota cada canción que escuchas en Spotify."}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-white">
            {allDone ? "Todo listo" : `${doneCount} de ${steps.length} pasos listos`}
          </span>
          {liveReady && !allDone && (
            <span className="text-xs text-spotify-green">Ya puedes usar la app mientras terminas</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-spotify-green transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        <Step
          n={1}
          title="Pide tu historial a Spotify"
          why="Spotify tarda unos días en mandarlo, así que conviene pedirlo primero y seguir con lo demás mientras llega."
          done={stepRequested}
        >
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Entra a <ExtLink href="https://www.spotify.com/account/privacy/">spotify.com/account/privacy</ExtLink>.
            </li>
            <li>
              En <strong className="text-white">Descargar tus datos</strong>, marca solo{" "}
              <strong className="text-white">Historial de streaming extendido</strong> y aprieta{" "}
              <strong className="text-white">Solicitar datos</strong>.
            </li>
            <li>Confirma el correo que te manda Spotify. Si no lo confirmas, no empieza a prepararlo.</li>
          </ol>
          {!status.history.imported && (
            <ManualCheck checked={Boolean(checks.zipRequested)} onChange={() => toggle("zipRequested")} label="Ya lo pedí" />
          )}
        </Step>

        {spotifyLive ? (
          <li className="rounded-xl border border-spotify-green/30 bg-spotify-green/5 p-4 sm:p-5">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-spotify-green text-black">
                <Check className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-white">Spotify en vivo conectado</p>
                <p className="mt-0.5 text-sm text-spotify-light-gray">
                  Tus canciones nuevas llegan solas cada pocos minutos. No necesitas Last.fm.
                </p>
              </div>
            </div>
          </li>
        ) : (
          <>
            <Step
              n={2}
              title="Crea una cuenta en Last.fm"
              why="Es gratis. Last.fm va anotando cada canción que escuchas, y Statsify lee de ahí lo nuevo."
              done={stepAccount}
            >
              <a
                href="https://www.last.fm/join"
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                Crear cuenta en Last.fm <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
              {!lastfm && (
                <ManualCheck
                  checked={Boolean(checks.lastfmAccount)}
                  onChange={() => toggle("lastfmAccount")}
                  label="Ya tengo cuenta"
                />
              )}
            </Step>

            <Step
              n={3}
              title="Conecta Last.fm con Statsify"
              why="Te lleva a last.fm para que autorices a Statsify a leer tus canciones. No vence."
              done={stepConnected}
            >
              {lastfm ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-white">
                    Conectado como <strong>{lastfm.username}</strong>
                  </span>
                  <button type="button" onClick={disconnectLastfm} className="text-xs underline hover:text-white">
                    Desconectar
                  </button>
                </div>
              ) : status.lastfmConfigured ? (
                <a href="/api/lastfm/connect" className={buttonVariants({ size: "sm" })}>
                  Conectar Last.fm
                </a>
              ) : (
                <p className="text-yellow-200">Last.fm todavía no está configurado en Statsify. Avísale al admin.</p>
              )}
            </Step>

            <Step
              n={4}
              title="Haz que Spotify le avise a Last.fm"
              why="Así cada canción que escuches en Spotify, en cualquier dispositivo, queda anotada en Last.fm."
              done={stepReceiving}
              disabled={!lastfm}
            >
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Entra a{" "}
                  <ExtLink href="https://www.last.fm/settings/applications">last.fm/settings/applications</ExtLink>.
                </li>
                <li>
                  En <strong className="text-white">Spotify Scrobbling</strong>, aprieta{" "}
                  <strong className="text-white">Connect</strong> y autoriza con tu cuenta de Spotify.
                </li>
                <li>Escucha una canción completa en Spotify y aprieta &quot;Revisar ahora&quot;.</li>
              </ol>
              {lastfm && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={checkNow} disabled={checking}>
                    {checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Revisar ahora
                      </>
                    )}
                  </Button>
                  <span className={stepReceiving ? "text-spotify-green" : ""}>
                    {lastfm.latestScrobbleAt
                      ? `Última canción en Last.fm: ${timeAgo(lastfm.latestScrobbleAt)}`
                      : "Todavía no llega ninguna canción."}
                  </span>
                </div>
              )}
              {lastfm?.lastError && <p className="text-red-300">{lastfm.lastError}</p>}
              <p className="text-xs">
                Spotify corta esta conexión cada 6 meses. Last.fm te avisa cuando toque reconectarla.
              </p>
            </Step>
          </>
        )}

        <Step
          n={spotifyLive ? 2 : 5}
          title="Sube tu historial cuando te llegue"
          why="Cuando Spotify te avise por correo, descarga el zip y súbelo tal cual. Con eso se completan tus estadísticas desde el principio."
          done={stepImported}
        >
          {status.history.imported ? (
            <p className="text-white">Historial cargado.</p>
          ) : (
            <Link href="/import" className={buttonVariants({ size: "sm", variant: "secondary" })}>
              Ir a subir el historial
            </Link>
          )}
        </Step>
      </ol>

      {!status.spotify.connected && status.loginProvider !== "spotify" && (
        <div className="rounded-xl border border-white/5 p-4 text-sm text-spotify-light-gray">
          <p className="font-medium text-white">¿El admin te dio un cupo de Spotify?</p>
          <p className="mt-1">
            Spotify deja conectar directo solo a 5 personas. Si te agregaron, conéctalo y tus canciones llegan
            sin pasar por Last.fm.
          </p>
          <a href="/api/spotify/connect" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-3")}>
            Conectar Spotify
          </a>
        </div>
      )}

      {allDone && (
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Ir a mis estadísticas
        </Link>
      )}

      {lastfm && (
        <p className="text-center text-xs text-spotify-light-gray/70">
          Las canciones nuevas llegan vía{" "}
          <a href="https://www.last.fm" target="_blank" rel="noreferrer" className="underline">
            Last.fm
          </a>
          .
        </p>
      )}
    </div>
  );
}
