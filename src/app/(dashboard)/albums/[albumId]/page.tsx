"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { TimeFilterControl } from "@/components/stats/time-filter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stats/stat-card";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";
import type { TimeFilterParams } from "@/types/database";
import {
  ArrowLeft,
  Clock,
  Disc3,
  ExternalLink,
  Headphones,
  Music2,
} from "lucide-react";

function filterFromSearchParams(sp: URLSearchParams): TimeFilterParams {
  const filter = (sp.get("filter") || "all") as TimeFilterParams["filter"];
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const month = sp.get("month") ? Number(sp.get("month")) : undefined;
  return { filter, year, month };
}

function filterToSearchString(ft: TimeFilterParams): string {
  const p = new URLSearchParams();
  p.set("filter", ft.filter);
  if (ft.year != null) p.set("year", String(ft.year));
  if (ft.month != null) p.set("month", String(ft.month));
  return p.toString();
}

type TrackRow = {
  id: string;
  name: string;
  duration_ms: number;
  track_number: number;
  play_count: number;
  total_ms_played: number;
  listened: boolean;
};

type AlbumDetailPayload = {
  album: {
    id: string;
    name: string;
    image_url: string | null;
    spotify_url: string | null;
    artist_name: string | null;
  };
  stats: { play_count: number; total_ms_played: number };
  spotify_full_tracklist: boolean;
  unheard_count: number;
  tracks: TrackRow[];
};

function AlbumDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40 rounded-lg" />
      <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function AlbumDetailInner({ params }: { params: { albumId: string } }) {
  const rawId = params.albumId;
  const albumId = decodeURIComponent(rawId);

  const searchParams = useSearchParams();
  const queryString = searchParams?.toString() ?? "";
  const filterFromUrl = useMemo(
    () => filterFromSearchParams(new URLSearchParams(queryString)),
    [queryString]
  );

  const [timeFilter, setTimeFilter] =
    useState<TimeFilterParams>(filterFromUrl);

  useEffect(() => {
    setTimeFilter(filterFromSearchParams(new URLSearchParams(queryString)));
  }, [queryString]);

  const [data, setData] = useState<AlbumDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryBase = useMemo(
    () => filterToSearchString(timeFilter),
    [timeFilter]
  );

  const listHref = `/albums?${queryBase}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qp = filterToSearchString(timeFilter);
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}?${qp}`);
      if (res.status === 404) {
        setError("No encontramos este álbum.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error("bad response");
      const json = (await res.json()) as AlbumDetailPayload;
      setData(json);
    } catch {
      setError("No se pudo cargar el álbum.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [albumId, timeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3">
        <Link
          href={listHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "min-h-[44px] w-full justify-center gap-2 text-spotify-light-gray sm:w-fit sm:min-h-0 sm:justify-start"
          )}
        >
          <ArrowLeft className="h-4 w-4" /> Volver a álbumes
        </Link>
      </div>

      <TimeFilterControl value={timeFilter} onChange={setTimeFilter} />

      <p className="text-xs leading-relaxed text-spotify-light-gray/65">
        Reproducciones y tiempos por canción para {CHILE_TIMEZONE_LABEL} en el período elegido.
      </p>

      {loading && <AlbumDetailSkeleton />}

      {!loading && error && (
        <p className="text-sm text-red-400/90">{error}</p>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="relative mx-auto h-36 w-36 shrink-0 overflow-hidden rounded-xl bg-spotify-medium-gray shadow-lg sm:mx-0 sm:h-44 sm:w-44">
              {data.album.image_url ? (
                <Image
                  src={data.album.image_url}
                  alt={data.album.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Disc3 className="h-20 w-20 text-spotify-light-gray" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-sm text-spotify-light-gray">
                {data.album.artist_name ?? "—"}
              </p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl md:text-3xl">
                {data.album.name}
              </h1>
              {data.album.spotify_url && (
                <a
                  href={data.album.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-spotify-green hover:underline"
                >
                  Escuchar en Spotify <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <StatCard
              title="Reproducciones (álbum)"
              value={formatReproductionCount(data.stats.play_count)}
              icon={Disc3}
            />
            <StatCard
              title="Tiempo escuchado"
              value={formatMs(data.stats.total_ms_played)}
              subtitle={`${formatReproductionCount(Math.round(data.stats.total_ms_played / 3600000))} h redondeadas`}
              icon={Clock}
            />
          </div>

          {data.spotify_full_tracklist &&
            data.unheard_count > 0 &&
            data.album.spotify_url && (
              <div className="rounded-xl border border-spotify-green/25 bg-spotify-green/10 px-3 py-3 text-sm leading-relaxed text-spotify-light-gray sm:px-4">
                <p className="flex items-start gap-2">
                  <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-spotify-green" />
                  <span>
                    En este período aún no aparecen en tu historial{" "}
                    <span className="font-medium text-white">
                      {formatReproductionCount(data.unheard_count)}
                    </span>{" "}
                    {data.unheard_count === 1 ? "canción" : "canciones"} del álbum
                    (orden del disco en Spotify). ¡Dales play!
                  </span>
                </p>
                <a
                  href={data.album.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-spotify-green hover:underline"
                >
                  Abrir álbum en Spotify
                </a>
              </div>
            )}

          {!data.spotify_full_tracklist && (
            <p className="text-xs text-spotify-light-gray/70">
              Sin sesión de Spotify no pudimos cargar el tracklist oficial; mostramos solo los
              temas que ya tenés asociados al álbum en tu base de datos.
            </p>
          )}

          <Card className="overflow-hidden">
            <CardHeader className="px-4 pt-5 sm:p-6 sm:pb-2">
              <CardTitle className="text-base sm:text-lg">Canciones del álbum</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4 pt-0 sm:p-6 sm:pt-0">
              {data.tracks.length === 0 ? (
                <p className="text-sm text-spotify-light-gray">
                  Sin canciones para mostrar.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.tracks.map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:p-2.5",
                        t.listened ? "border-white/5" : "border-amber-500/25 bg-amber-500/5"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                        <span className="w-8 shrink-0 pt-0.5 text-right text-xs tabular-nums text-spotify-light-gray/60 sm:pt-0">
                          {t.track_number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug text-white">{t.name}</p>
                          <p className="mt-0.5 text-xs text-spotify-light-gray">
                            {formatMs(t.duration_ms)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 pl-11 text-left sm:ml-auto sm:pl-0 sm:text-right">
                        {t.listened ? (
                          <p className="text-xs text-spotify-light-gray">
                            <span className="font-medium tabular-nums text-white">
                              {formatReproductionCount(t.play_count)}
                            </span>{" "}
                            repros · {formatMs(t.total_ms_played)}
                          </p>
                        ) : (
                          <span className="inline-block rounded-full border border-amber-400/35 bg-black/40 px-2.5 py-1 text-[11px] leading-tight text-amber-100/95">
                            Sin reproducir en este período
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AlbumDetailPage({
  params,
}: {
  params: { albumId: string };
}) {
  return (
    <Suspense fallback={<AlbumDetailSkeleton />}>
      <AlbumDetailInner params={params} />
    </Suspense>
  );
}
