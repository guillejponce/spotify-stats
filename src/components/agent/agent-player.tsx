"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ListMusic,
  LogIn,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

type PlayerTrack = {
  id: string | null;
  uri: string | null;
  name: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number;
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

export function AgentPlayer({ className }: { className?: string }) {
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

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

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/5 bg-spotify-dark-gray",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <ListMusic className="h-4 w-4 text-spotify-green" />
        <p className="text-sm font-semibold text-white">Reproductor</p>
        {player?.device?.name ? (
          <span className="ml-auto truncate text-[10px] text-spotify-light-gray/70">
            {player.device.name}
          </span>
        ) : null}
      </div>

      <div className="border-b border-white/5 p-4">
        {loading && !track ? (
          <p className="text-sm text-spotify-light-gray">Sincronizando…</p>
        ) : needsReconnect ? (
          <div className="space-y-3">
            <p className="text-sm text-spotify-light-gray">
              {error?.message || "Conecta Spotify para ver lo que suena y la cola."}
            </p>
            <a href="/api/spotify/auth">
              <Button size="sm">
                <LogIn className="mr-2 h-4 w-4" />
                Conectar Spotify
              </Button>
            </a>
          </div>
        ) : !track ? (
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-spotify-medium-gray">
              <Music2 className="h-7 w-7 text-spotify-light-gray" />
            </div>
            <div>
              <p className="text-sm text-white">Nada sonando</p>
              <p className="text-xs text-spotify-light-gray">
                Abre Spotify en cualquier dispositivo y dale play.
              </p>
            </div>
          </div>
        ) : (
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
              </div>
            </div>

            <div>
              <Progress value={percent} className="h-1.5" />
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-spotify-light-gray/70">
                <span>{formatClock(progress)}</span>
                <span>{formatClock(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Anterior"
                disabled={busy}
                onClick={() => void control("previous")}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </button>
              <button
                type="button"
                aria-label={player?.is_playing ? "Pausa" : "Reproducir"}
                disabled={busy}
                onClick={() =>
                  void control(player?.is_playing ? "pause" : "play")
                }
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black hover:scale-105 disabled:opacity-40"
              >
                {player?.is_playing ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </button>
              <button
                type="button"
                aria-label="Siguiente"
                disabled={busy}
                onClick={() => void control("next")}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </button>
            </div>

            {error && !needsReconnect ? (
              <p className="text-xs text-amber-200/90">{error.message}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-spotify-light-gray/70">
          A continuación
        </p>
        {player?.queue.length ? (
          <ol className="space-y-1">
            {player.queue.map((item, i) => (
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
                  <p className="truncate text-xs font-medium text-white">
                    {item.name}
                  </p>
                  <p className="truncate text-[11px] text-spotify-light-gray">
                    {item.artist}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-1 text-xs text-spotify-light-gray/70">
            La cola está vacía. Lo que suene después depende de Spotify (álbum,
            playlist o radio).
          </p>
        )}
      </div>
    </aside>
  );
}
