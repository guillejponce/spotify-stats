"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Music2, Pause, Loader2 } from "lucide-react";
import {
  CompactListenRanks,
  FullListenRanks,
} from "@/components/now-playing/listen-ranks";
import type { ListenRank } from "@/lib/listen-rank-types";

interface NowPlayingData {
  track_id: string | null;
  artist_id: string | null;
  track_name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  duration_ms: number;
  progress_ms: number;
  is_playing: boolean;
  current_rating: number | null;
  key?: string | null;
  tempo?: number | null;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NowPlayingCard({
  variant = "compact",
}: {
  /** compact: dashboard. full: página Now Playing. */
  variant?: "compact" | "full";
}) {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRating, setSavingRating] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [tick, setTick] = useState(0);
  const [trackRank, setTrackRank] = useState<ListenRank | null>(null);
  const [artistRank, setArtistRank] = useState<ListenRank | null>(null);
  const anchorRef = useRef({ at: 0, progress: 0 });

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      if (res.ok) {
        const data = await res.json();
        const np = data.nowPlaying as NowPlayingData | null;
        setNowPlaying(np);
        if (np) {
          anchorRef.current = { at: Date.now(), progress: np.progress_ms };
          setTick(0);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trackId = nowPlaying?.track_id;
    const artistId = nowPlaying?.artist_id;
    if (!trackId && !artistId) {
      setTrackRank(null);
      setArtistRank(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (trackId) params.set("track_id", trackId);
    if (artistId) params.set("artist_id", artistId);
    void fetch(`/api/listen-ranks?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { track?: ListenRank; artist?: ListenRank } | null) => {
        if (cancelled || !data) return;
        setTrackRank(data.track ?? null);
        setArtistRank(data.artist ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setTrackRank(null);
          setArtistRank(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nowPlaying?.track_id, nowPlaying?.artist_id]);

  async function handleRate(rating: number) {
    if (!nowPlaying?.track_id || savingRating) return;
    setSavingRating(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: nowPlaying.track_id, rating }),
      });
      if (res.ok) {
        setNowPlaying((prev) => (prev ? { ...prev, current_rating: rating } : prev));
      }
    } catch {
      // silently fail
    } finally {
      setSavingRating(false);
    }
  }

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  useEffect(() => {
    if (!nowPlaying?.is_playing) return;
    const id = window.setInterval(() => setTick(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [nowPlaying?.is_playing, nowPlaying?.track_id]);

  if (loading) return <NowPlayingSkeleton />;

  if (!nowPlaying) {
    return (
      <Card className="overflow-hidden border-white/[0.06]">
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] sm:h-[4.5rem] sm:w-[4.5rem]">
            <Music2 className="h-7 w-7 text-spotify-light-gray" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Reproductor
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">Nada sonando</p>
            <p className="text-xs text-spotify-light-gray/70">
              Pon algo en Spotify y aparece acá al toque.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const liveProgress = nowPlaying.is_playing
    ? Math.min(
        nowPlaying.duration_ms,
        anchorRef.current.progress + Math.max(0, (tick || Date.now()) - anchorRef.current.at),
      )
    : nowPlaying.progress_ms;
  const progressPercent =
    nowPlaying.duration_ms > 0 ? (liveProgress / nowPlaying.duration_ms) * 100 : 0;
  const shownRating = hoverStar || nowPlaying.current_rating || 0;

  return (
    <Card className="relative overflow-hidden border-white/[0.08] bg-spotify-dark-gray">
      {nowPlaying.album_art_url && (
        <>
          <Image
            src={nowPlaying.album_art_url}
            alt=""
            fill
            className="object-cover opacity-30 blur-2xl scale-125"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-spotify-black via-spotify-black/80 to-spotify-black/40" />
        </>
      )}

      <CardContent className="relative p-0">
        <div className="flex items-center gap-3.5 p-3.5 sm:gap-5 sm:p-5">
          <div className="relative h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10 sm:h-28 sm:w-28">
            {nowPlaying.album_art_url ? (
              <Image
                src={nowPlaying.album_art_url}
                alt={nowPlaying.album_name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 76px, 112px"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
                <Music2 className="h-8 w-8 text-spotify-light-gray" />
              </div>
            )}
            {nowPlaying.is_playing && (
              <div className="absolute inset-x-0 bottom-0 flex h-7 items-end justify-center gap-[3px] bg-gradient-to-t from-black/60 to-transparent pb-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="eq-bar w-[3px] rounded-full bg-spotify-green"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {nowPlaying.is_playing ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-spotify-green opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-spotify-green" />
                </span>
              ) : (
                <Pause className="h-3 w-3 text-spotify-light-gray" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-spotify-green">
                {nowPlaying.is_playing ? "Sonando ahora" : "En pausa"}
              </span>
            </div>
            <p className="truncate text-[15px] font-semibold leading-tight text-white sm:text-xl">
              {nowPlaying.track_name}
            </p>
            <p className="mt-0.5 truncate text-sm text-white/75">{nowPlaying.artist_name}</p>
            <p className="truncate text-xs text-white/40">{nowPlaying.album_name}</p>
            <HarmonyLine keyName={nowPlaying.key} tempo={nowPlaying.tempo} />
            {variant === "compact" && (
              <CompactListenRanks track={trackRank} artist={artistRank} />
            )}

            <div className="mt-3 hidden sm:block">
              <ProgressLine percent={progressPercent} />
              <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-white/45">
                <span>{formatClock(liveProgress)}</span>
                <span>{formatClock(nowPlaying.duration_ms)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-3.5 pb-2 sm:hidden">
          <ProgressLine percent={progressPercent} />
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-white/45">
            <span>{formatClock(liveProgress)}</span>
            <span>{formatClock(nowPlaying.duration_ms)}</span>
          </div>
        </div>

        {variant === "full" && (trackRank || artistRank) && (
          <FullListenRanks
            track={trackRank}
            artist={artistRank}
            artistId={nowPlaying.artist_id}
            artistName={nowPlaying.artist_name}
          />
        )}

        {nowPlaying.track_id && (
          <div className="flex items-center gap-2 px-3.5 pb-3.5 sm:px-5 sm:pb-5">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={savingRating}
                  aria-label={`Valorar ${n} de 10`}
                  onMouseEnter={() => setHoverStar(n)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => void handleRate(n)}
                  className={cn(
                    "flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums transition sm:h-9 sm:text-xs",
                    shownRating >= n
                      ? "bg-spotify-green text-black shadow-[0_0_12px_rgba(29,185,84,0.25)]"
                      : "bg-white/[0.06] text-white/40 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex h-8 w-10 shrink-0 items-center justify-center sm:h-9 sm:w-12">
              {savingRating ? (
                <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
              ) : nowPlaying.current_rating ? (
                <span className="text-xs font-bold tabular-nums text-spotify-green">
                  {nowPlaying.current_rating}
                  <span className="text-white/30">/10</span>
                </span>
              ) : (
                <span className="text-[10px] text-white/30">Nota</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HarmonyLine({
  keyName,
  tempo,
}: {
  keyName?: string | null;
  tempo?: number | null;
}) {
  const parts = [
    keyName ? `Tono ${keyName}` : null,
    tempo != null ? `${tempo} BPM` : null,
  ].filter(Boolean);
  if (parts.length === 0) {
    return (
      <p className="mt-0.5 truncate text-[10px] tabular-nums text-white/35 sm:text-[11px]">
        Sin tono/BPM medido
      </p>
    );
  }
  return (
    <p className="mt-0.5 truncate text-[10px] tabular-nums text-white/40 sm:text-[11px]">
      {parts.join(" · ")}
    </p>
  );
}

function ProgressLine({ percent }: { percent: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-spotify-green"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function NowPlayingSkeleton() {
  return (
    <Card className="overflow-hidden border-white/[0.06]">
      <CardContent className="p-3.5 sm:p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-[4.75rem] w-[4.75rem] rounded-2xl sm:h-28 sm:w-28" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-3 h-1.5 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
