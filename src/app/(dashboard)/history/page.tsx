"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs } from "@/lib/utils";
import { formatChileDateTimeFromIso } from "@/lib/chile-time";
import { Music2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface HistoryPlay {
  id: string;
  played_at: string;
  ms_played: number;
  platform: string | null;
  reason_start: string | null;
  reason_end: string | null;
  shuffle: boolean | null;
  offline: boolean | null;
  source: string | null;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  image_url: string | null;
}

function PlaybackMeta({ play }: { play: HistoryPlay }) {
  const bits: string[] = [];
  if (play.platform) bits.push(`Plataforma: ${play.platform}`);
  if (play.source) bits.push(`Origen: ${play.source}`);
  if (play.reason_start) bits.push(`Inicio: ${play.reason_start}`);
  if (play.reason_end) bits.push(`Fin: ${play.reason_end}`);
  if (play.shuffle != null) bits.push(play.shuffle ? "Shuffle" : "Sin shuffle");
  if (play.offline != null) bits.push(play.offline ? "Offline" : "Online");

  if (bits.length === 0) return null;

  return (
    <p className="mt-1 text-[11px] leading-snug text-spotify-light-gray/65">
      {bits.join(" · ")}
    </p>
  );
}

export default function HistoryPage() {
  const [plays, setPlays] = useState<HistoryPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  const fetchHistory = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          offset: String(page * limit),
          limit: String(limit),
          _t: String(Date.now()),
        });
        const res = await fetch(`/api/history?${params}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setPlays(data.plays || []);
          setHasMore((data.plays || []).length === limit);
        } else if (opts?.silent) {
          console.warn("[history] silent refresh failed", res.status);
        }
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [page, limit]
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (page !== 0) return;

    const tick = () => void fetchHistory({ silent: true });
    const id = window.setInterval(tick, 20_000);

    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onFocus = () => tick();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [page, fetchHistory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Historial</h1>
          <p className="text-sm text-spotify-light-gray">
            Fecha y hora en Chile; detalle de reproducción según tus datos.
            {page === 0 && (
              <span className="block mt-1 text-xs text-spotify-light-gray/60">
                La primera página se actualiza cada ~20 s (y al volver a la pestaña).
              </span>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => void fetchHistory()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos plays</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : plays.length === 0 ? (
            <p className="py-8 text-center text-sm text-spotify-light-gray">
              No listening history found. Import your data to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {plays.map((play) => (
                <div
                  key={play.id}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                    {play.image_url ? (
                      <Image
                        src={play.image_url}
                        alt={play.track_name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
                        <Music2 className="h-4 w-4 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {play.track_name}
                    </p>
                    <p className="truncate text-xs text-spotify-light-gray">
                      {play.artist_name}
                      {play.album_name && ` · ${play.album_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-white/90">
                      {formatChileDateTimeFromIso(play.played_at)}
                    </p>
                    <p className="text-[11px] text-spotify-light-gray/80">
                      Escuchado {formatMs(play.ms_played)}
                    </p>
                    <PlaybackMeta play={play} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-spotify-light-gray">
              Página {page + 1}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
