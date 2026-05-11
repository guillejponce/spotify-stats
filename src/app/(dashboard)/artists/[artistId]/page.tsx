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
import { cn, formatMs, formatNumber } from "@/lib/utils";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";
import type { TimeFilterParams, TopItem } from "@/types/database";
import {
  ArrowLeft,
  Clock,
  Disc3,
  ExternalLink,
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

type DetailPayload = {
  artist: {
    id: string;
    name: string;
    image_url: string | null;
    spotify_url: string | null;
    genres: string[] | null;
  };
  stats: { play_count: number; total_ms_played: number };
  tracks: TopItem[];
};

function ArtistDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40 rounded-lg" />
      <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function ArtistDetailInner({
  params,
}: {
  params: { artistId: string };
}) {
  const rawId = params.artistId;
  const artistId = decodeURIComponent(rawId);

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

  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryBase = useMemo(
    () => filterToSearchString(timeFilter),
    [timeFilter]
  );

  const listHref = `/artists?${queryBase}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qp = filterToSearchString(timeFilter);
      const res = await fetch(
        `/api/artists/${encodeURIComponent(artistId)}?${qp}`
      );
      if (res.status === 404) {
        setError("No encontramos este artista.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error("bad response");
      const json = (await res.json()) as DetailPayload;
      setData(json);
    } catch {
      setError("No se pudo cargar el artista.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [artistId, timeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={listHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-2 text-spotify-light-gray"
          )}
        >
          <ArrowLeft className="h-4 w-4" /> Volver a artistas
        </Link>
      </div>

      <TimeFilterControl value={timeFilter} onChange={setTimeFilter} />

      <p className="text-xs text-spotify-light-gray/65">
        Estadísticas del período en {CHILE_TIMEZONE_LABEL}.
      </p>

      {loading && <ArtistDetailSkeleton />}

      {!loading && error && (
        <p className="text-sm text-red-400/90">{error}</p>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="relative mx-auto h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-spotify-medium-gray shadow-lg sm:mx-0">
              {data.artist.image_url ? (
                <Image
                  src={data.artist.image_url}
                  alt={data.artist.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Music2 className="h-16 w-16 text-spotify-light-gray" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {data.artist.name}
              </h1>
              {data.artist.genres && data.artist.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {data.artist.genres.slice(0, 8).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-spotify-light-gray"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {data.artist.spotify_url && (
                <a
                  href={data.artist.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-spotify-green hover:underline"
                >
                  Abrir en Spotify <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              title="Reproducciones"
              value={formatNumber(data.stats.play_count)}
              icon={Disc3}
            />
            <StatCard
              title="Tiempo escuchado"
              value={formatMs(data.stats.total_ms_played)}
              subtitle={`${formatNumber(Math.round(data.stats.total_ms_played / 3600000))} h redondeadas`}
              icon={Clock}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Canciones en este período</CardTitle>
            </CardHeader>
            <CardContent>
              {data.tracks.length === 0 ? (
                <p className="text-sm text-spotify-light-gray">
                  Sin datos en el rango elegido.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.tracks.map((t, i) => (
                    <li
                      key={`${t.id}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-white/5 p-2"
                    >
                      <span className="w-7 text-right text-xs text-spotify-light-gray/50">
                        {i + 1}
                      </span>
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
                        {t.image_url ? (
                          <Image
                            src={t.image_url}
                            alt=""
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Music2 className="h-4 w-4 text-spotify-light-gray" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{t.name}</p>
                        <p className="text-xs text-spotify-light-gray">
                          {formatNumber(t.play_count)} reproducciones ·{" "}
                          {formatMs(t.total_ms_played)}
                        </p>
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

export default function ArtistDetailPage({
  params,
}: {
  params: { artistId: string };
}) {
  return (
    <Suspense fallback={<ArtistDetailSkeleton />}>
      <ArtistDetailInner params={params} />
    </Suspense>
  );
}
