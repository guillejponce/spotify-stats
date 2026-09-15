"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ListMusic,
  LogIn,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { askKurt, KNOW_MORE_PROMPT } from "@/lib/agent/ask-kurt";

type PlayerTrack = {
  id: string | null;
  uri: string | null;
  name: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number;
  album_type?: string | null;
  release_date?: string | null;
  track_number?: number | null;
  total_tracks?: number | null;
  popularity?: number | null;
};

type PlayerSnapshot = {
  is_playing: boolean;
  progress_ms: number;
  device: { id: string | null; name: string | null } | null;
  track: PlayerTrack | null;
  queue: PlayerTrack[];
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trackCatalogLine(track: PlayerTrack): string | null {
  const parts: string[] = [];
  const type = (track.album_type ?? "").toLowerCase();
  if (type === "single") parts.push("Single");
  else if (type === "album") parts.push("Álbum");
  else if (type === "compilation") parts.push("Recopilatorio");
  if (type === "album" && track.track_number && track.total_tracks) {
    parts.push(`${track.track_number}/${track.total_tracks}`);
  }
  const year = track.release_date?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) parts.push(year);
  return parts.length ? parts.join(" · ") : null;
}

function Transport({
  busy,
  playing,
  onControl,
  size = "md",
}: {
  busy: boolean;
  playing: boolean;
  onControl: (action: "play" | "pause" | "next" | "previous") => void;
  size?: "sm" | "md";
}) {
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const playBtn =
    size === "sm"
      ? "h-9 w-9"
      : "h-11 w-11";
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-3">
      <button
        type="button"
        aria-label="Anterior"
        disabled={busy}
        onClick={() => onControl("previous")}
        className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        <SkipBack className={cn(icon, "fill-current")} />
      </button>
      <button
        type="button"
        aria-label={playing ? "Pausa" : "Reproducir"}
        disabled={busy}
        onClick={() => onControl(playing ? "pause" : "play")}
        className={cn(
          "flex items-center justify-center rounded-full bg-white text-black hover:scale-105 disabled:opacity-40",
          playBtn,
        )}
      >
        {playing ? (
          <Pause className={cn(icon, "fill-current")} />
        ) : (
          <Play className={cn(icon, "ml-0.5 fill-current")} />
        )}
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        disabled={busy}
        onClick={() => onControl("next")}
        className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        <SkipForward className={cn(icon, "fill-current")} />
      </button>
    </div>
  );
}

function QueueList({ queue }: { queue: PlayerTrack[] }) {
  if (!queue.length) {
    return (
      <p className="px-1 text-xs text-spotify-light-gray/70">
        La cola está vacía. Lo que suene después depende de Spotify.
      </p>
    );
  }
  return (
    <ol className="space-y-1">
      {queue.map((item, i) => (
        <li
          key={`${item.uri ?? item.id ?? item.name}-${i}`}
          className="flex items-center gap-3 rounded-lg px-1 py-1.5"
        >
          <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-spotify-light-gray/40">
            {i + 1}
          </span>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
            {item.album_art_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.album_art_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{item.name}</p>
            <p className="truncate text-[11px] text-spotify-light-gray">
              {item.artist}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AgentPlayer({ className }: { className?: string }) {
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/player", { cache: "no-store" });
      const data = (await res.json()) as PlayerSnapshot & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setPlayer(null);
        setError({
          message: data.error || "No se pudo leer Spotify",
          code:
            data.code ||
            (res.status === 401
              ? "NOT_CONNECTED"
              : res.status === 403
                ? "FORBIDDEN"
                : undefined),
        });
        return;
      }
      setError(null);
      setPlayer(data);
      setProgress(data.progress_ms ?? 0);
    } catch {
      setError({ message: "No se pudo leer el reproductor" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, [load]);

  const playing = Boolean(player?.is_playing && player.track);
  const durationMs = player?.track?.duration_ms ?? 0;

  useEffect(() => {
    if (!playing || durationMs <= 0) return;
    const id = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1000, durationMs));
    }, 1000);
    return () => clearInterval(id);
  }, [playing, durationMs]);

  async function control(action: "play" | "pause" | "next" | "previous") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/spotify/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        player?: PlayerSnapshot | null;
      };
      if (!res.ok) {
        setError({
          message: data.error || "No se pudo controlar Spotify",
          code: data.code,
        });
        return;
      }
      if (data.player) {
        setError(null);
        setPlayer(data.player);
        setProgress(data.player.progress_ms ?? 0);
      } else {
        await load();
      }
    } catch {
      setError({ message: "No se pudo controlar Spotify" });
    } finally {
      setBusy(false);
    }
  }

  const track = player?.track ?? null;
  const duration = track?.duration_ms ?? 0;
  const percent = duration > 0 ? (progress / duration) * 100 : 0;
  const needsReconnect =
    error?.code === "NOT_CONNECTED" ||
    error?.code === "EXPIRED" ||
    error?.code === "FORBIDDEN";
  const queue = player?.queue ?? [];

  const catalogLine = track ? trackCatalogLine(track) : null;

  const emptyOrSync = (
    <div className="flex items-center gap-3 p-2.5 lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:p-6 lg:text-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-spotify-medium-gray lg:h-16 lg:w-16">
        <Music2 className="h-5 w-5 text-spotify-light-gray lg:h-7 lg:w-7" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-white">
          {loading && !track ? "Sincronizando…" : "Nada sonando"}
        </p>
        <p className="text-[11px] text-spotify-light-gray lg:text-xs">
          Abre Spotify en cualquier dispositivo y dale play.
        </p>
      </div>
    </div>
  );

  const reconnect = (
    <div className="flex items-center gap-3 p-2.5 lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:gap-3 lg:p-6 lg:text-center">
      <p className="min-w-0 flex-1 text-xs text-spotify-light-gray lg:flex-none lg:text-sm">
        {error?.message || "Conecta Spotify para ver lo que suena y la cola."}
      </p>
      <a href="/api/spotify/auth" className="shrink-0">
        <Button size="sm">
          <LogIn className="mr-2 h-4 w-4" />
          Conectar
        </Button>
      </a>
    </div>
  );

  return (
    <aside
      className={cn(
        "relative flex min-h-0 flex-col overflow-visible rounded-2xl border border-white/5 bg-spotify-dark-gray lg:h-full lg:overflow-hidden",
        className,
      )}
    >
      <div className="hidden items-center gap-2 border-b border-white/5 px-4 py-3 lg:flex">
        <ListMusic className="h-4 w-4 text-spotify-green" />
        <p className="text-sm font-semibold text-white">Reproductor</p>
        {player?.device?.name ? (
          <span className="ml-auto truncate text-[10px] text-spotify-light-gray/70">
            {player.device.name}
          </span>
        ) : null}
      </div>

      {needsReconnect ? (
        reconnect
      ) : !track ? (
        emptyOrSync
      ) : (
        <>
          {/* Teléfono: barra compacta. La cola flota sobre el chat, no lo aplasta. */}
          <div className="relative overflow-visible p-2.5 lg:hidden">
            {queueOpen ? (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-spotify-dark-gray p-2 shadow-2xl shadow-black/50">
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-spotify-light-gray/70">
                  A continuación
                </p>
                <QueueList queue={queue} />
              </div>
            ) : null}
            <div className="flex items-center gap-2.5">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-spotify-medium-gray">
                {track.album_art_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.album_art_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-5 w-5 text-spotify-light-gray" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {track.name}
                </p>
                <p className="truncate text-[11px] text-spotify-light-gray">
                  {track.artist}
                </p>
                {catalogLine ? (
                  <p className="truncate text-[10px] text-spotify-light-gray/60">
                    {catalogLine}
                  </p>
                ) : null}
              </div>
              <Transport
                busy={busy}
                playing={Boolean(player?.is_playing)}
                onControl={(a) => void control(a)}
                size="sm"
              />
            </div>
            <div className="mt-1.5">
              <Progress value={percent} className="h-1" />
              <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-spotify-light-gray/70">
                <span>{formatClock(progress)}</span>
                <span>{formatClock(duration)}</span>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 min-w-0 flex-1 gap-1.5 px-2 text-[11px]"
                onClick={() => askKurt(KNOW_MORE_PROMPT)}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-spotify-green" />
                Saber más
              </Button>
              <button
                type="button"
                onClick={() => setQueueOpen((v) => !v)}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-spotify-medium-gray px-2.5 text-[11px] text-white"
              >
                Cola {queue.length ? `(${queue.length})` : ""}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition",
                    queueOpen && "rotate-180",
                  )}
                />
              </button>
            </div>
            {error && !needsReconnect ? (
              <p className="mt-1 text-[11px] text-amber-200/90">{error.message}</p>
            ) : null}
          </div>

          {/* Desktop: panel completo */}
          <div className="hidden min-h-0 flex-1 flex-col lg:flex">
            <div className="border-b border-white/5 p-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-spotify-medium-gray">
                    {track.album_art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.album_art_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 className="h-7 w-7 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {track.name}
                    </p>
                    <p className="truncate text-xs text-spotify-light-gray">
                      {track.artist}
                    </p>
                    {track.album ? (
                      <p className="truncate text-[11px] text-spotify-light-gray/60">
                        {track.album}
                      </p>
                    ) : null}
                    {catalogLine ? (
                      <p className="truncate text-[11px] text-spotify-green/80">
                        {catalogLine}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <Progress value={percent} className="h-1.5" />
                  <div className="mt-1 flex justify-between text-[10px] tabular-nums text-spotify-light-gray/70">
                    <span>{formatClock(progress)}</span>
                    <span>{formatClock(duration)}</span>
                  </div>
                </div>
                <Transport
                  busy={busy}
                  playing={Boolean(player?.is_playing)}
                  onControl={(a) => void control(a)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => askKurt(KNOW_MORE_PROMPT)}
                >
                  <Sparkles className="h-3.5 w-3.5 text-spotify-green" />
                  Saber más de la canción
                </Button>
                {error && !needsReconnect ? (
                  <p className="text-xs text-amber-200/90">{error.message}</p>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-spotify-light-gray/70">
                A continuación
              </p>
              <QueueList queue={queue} />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
