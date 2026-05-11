"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs } from "@/lib/utils";
import { Music2, Pause, Play } from "lucide-react";

interface NowPlayingData {
  track_name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  duration_ms: number;
  progress_ms: number;
  is_playing: boolean;
}

export function NowPlayingCard() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      if (res.ok) {
        const data = await res.json();
        setNowPlaying(data.nowPlaying);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  if (loading) return <NowPlayingSkeleton />;

  if (!nowPlaying) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-spotify-medium-gray">
            <Music2 className="h-8 w-8 text-spotify-light-gray" />
          </div>
          <div>
            <p className="text-sm text-spotify-light-gray">Nothing playing</p>
            <p className="text-xs text-spotify-light-gray/60">
              Start playing something on Spotify
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercent =
    nowPlaying.duration_ms > 0
      ? (nowPlaying.progress_ms / nowPlaying.duration_ms) * 100
      : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-4 p-4">
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg shadow-lg">
            {nowPlaying.album_art_url ? (
              <Image
                src={nowPlaying.album_art_url}
                alt={nowPlaying.album_name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
                <Music2 className="h-8 w-8 text-spotify-light-gray" />
              </div>
            )}
            {nowPlaying.is_playing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="flex items-end gap-0.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1 animate-pulse rounded-full bg-spotify-green"
                      style={{
                        height: `${8 + Math.random() * 12}px`,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: "0.6s",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {nowPlaying.is_playing ? (
                <Play className="h-3 w-3 fill-spotify-green text-spotify-green" />
              ) : (
                <Pause className="h-3 w-3 text-spotify-light-gray" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-spotify-green">
                {nowPlaying.is_playing ? "Now Playing" : "Paused"}
              </span>
            </div>
            <p className="truncate text-sm font-semibold text-white">
              {nowPlaying.track_name}
            </p>
            <p className="truncate text-xs text-spotify-light-gray">
              {nowPlaying.artist_name}
            </p>
            <p className="truncate text-xs text-spotify-light-gray/60">
              {nowPlaying.album_name}
            </p>
          </div>
        </div>

        <div className="px-4 pb-4">
          <Progress value={progressPercent} />
          <div className="mt-1 flex justify-between text-[10px] text-spotify-light-gray/60">
            <span>{formatMs(nowPlaying.progress_ms)}</span>
            <span>{formatMs(nowPlaying.duration_ms)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NowPlayingSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="mt-3 h-2 w-full" />
      </CardContent>
    </Card>
  );
}
