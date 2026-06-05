"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { YearWheel } from "@/components/calendar/year-wheel";
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Disc3,
  ExternalLink,
  Music2,
  Users,
  Library,
} from "lucide-react";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import type {
  CalendarMemories,
  CalendarYearEntry,
  CalendarTrack,
  CalendarArtist,
  CalendarAlbum,
} from "@/types/database";

type Mode = "day" | "month";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function useChileNow() {
  return useMemo(() => {
    const now = new Date();
    const month = parseInt(formatInTimeZone(now, DISPLAY_TIME_ZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(now, DISPLAY_TIME_ZONE, "d"), 10);
    const currentYear = parseInt(
      formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy"),
      10,
    );
    return { month, day, currentYear };
  }, []);
}

function SpotifyLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-spotify-green/70 transition-colors hover:bg-spotify-green/10 hover:text-spotify-green"
      title="Abrir en Spotify"
    >
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function ItemImage({
  src,
  alt,
  fallbackIcon: Icon,
}: {
  src: string | null;
  alt: string;
  fallbackIcon: React.ComponentType<{ className?: string }>;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={48}
        height={48}
        className="h-12 w-12 rounded-lg object-cover"
        unoptimized
      />
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-spotify-medium-gray">
      <Icon className="h-5 w-5 text-spotify-light-gray/50" />
    </div>
  );
}

function TrackRow({ track, rank }: { track: CalendarTrack; rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-spotify-light-gray/40">
        {rank}
      </span>
      <ItemImage src={track.image_url} alt={track.name} fallbackIcon={Music2} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{track.name}</p>
        <p className="truncate text-xs text-spotify-light-gray">
          {track.artist_name ?? "—"} · {formatReproductionCount(track.play_count)} repr. · {formatMs(track.total_ms_played)}
        </p>
      </div>
      <SpotifyLink url={track.spotify_url} />
    </div>
  );
}

function ArtistRow({ artist, rank }: { artist: CalendarArtist; rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-spotify-light-gray/40">
        {rank}
      </span>
      <ItemImage src={artist.image_url} alt={artist.name} fallbackIcon={Users} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{artist.name}</p>
        <p className="truncate text-xs text-spotify-light-gray">
          {formatReproductionCount(artist.play_count)} repr. · {formatMs(artist.total_ms_played)}
        </p>
      </div>
      <SpotifyLink url={artist.spotify_url} />
    </div>
  );
}

function AlbumRow({ album, rank }: { album: CalendarAlbum; rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-spotify-light-gray/40">
        {rank}
      </span>
      <ItemImage src={album.image_url} alt={album.name} fallbackIcon={Disc3} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{album.name}</p>
        <p className="truncate text-xs text-spotify-light-gray">
          {album.artist_name ?? "—"} · {formatReproductionCount(album.play_count)} repr. · {formatMs(album.total_ms_played)}
        </p>
      </div>
      <SpotifyLink url={album.spotify_url} />
    </div>
  );
}

function SectionSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const { month, day, currentYear } = useChileNow();

  const [mode, setMode] = useState<Mode>("day");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<CalendarYearEntry[]>([]);
  const [data, setData] = useState<CalendarMemories | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearsLoading, setYearsLoading] = useState(true);

  // Fetch available years on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/calendar/years");
        if (!res.ok) throw new Error("fetch years failed");
        const json = await res.json();
        const entries: CalendarYearEntry[] = json.years ?? [];
        setAvailableYears(entries);

        if (entries.length > 0) {
          const years = entries.map((e) => e.year);
          const pastYears = years.filter((y) => y < currentYear);
          setSelectedYear(
            pastYears.length > 0 ? pastYears[pastYears.length - 1] : years[years.length - 1],
          );
        }
      } catch (err) {
        console.error("[calendar] load years:", err);
      } finally {
        setYearsLoading(false);
      }
    })();
  }, [currentYear]);

  const fetchMemories = useCallback(async () => {
    if (selectedYear == null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: String(month),
        ...(mode === "day" ? { day: String(day) } : {}),
      });
      const res = await fetch(`/api/calendar?${params.toString()}`);
      if (!res.ok) throw new Error("fetch memories failed");
      const json: CalendarMemories = await res.json();
      setData(json);
    } catch (err) {
      console.error("[calendar] load memories:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, mode, month, day]);

  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories]);

  const yearsArray = useMemo(
    () => availableYears.map((e) => e.year),
    [availableYears],
  );

  const hasData =
    data &&
    data.summary &&
    data.summary.play_count > 0;

  const periodLabel = useMemo(() => {
    if (selectedYear == null) return "";
    if (mode === "day") {
      return `${day} de ${MONTH_NAMES[month - 1]} de ${selectedYear}`;
    }
    return `${MONTH_NAMES[month - 1][0].toUpperCase()}${MONTH_NAMES[month - 1].slice(1)} de ${selectedYear}`;
  }, [selectedYear, mode, month, day]);

  const yearsAgo = selectedYear != null ? currentYear - selectedYear : 0;
  const yearsAgoLabel =
    yearsAgo === 0
      ? "Este año"
      : yearsAgo === 1
        ? "Hace 1 año"
        : `Hace ${yearsAgo} años`;

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col space-y-6 pb-28 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Calendario Musical
          </h1>
          <p className="mt-1 text-sm text-spotify-light-gray">
            Revive lo que escuchabas en esta fecha en años anteriores.
          </p>
        </div>

        {/* Day / Month toggle */}
        <div className="flex rounded-xl border border-white/10 bg-spotify-dark-gray p-1">
          <button
            onClick={() => setMode("day")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "day"
                ? "bg-spotify-medium-gray text-white"
                : "text-spotify-light-gray hover:text-white",
            )}
          >
            <CalendarDays className="h-4 w-4" />
            Día
          </button>
          <button
            onClick={() => setMode("month")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "month"
                ? "bg-spotify-medium-gray text-white"
                : "text-spotify-light-gray hover:text-white",
            )}
          >
            <CalendarRange className="h-4 w-4" />
            Mes
          </button>
        </div>
      </div>

      {/* Period header */}
      {selectedYear != null && (
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-spotify-green">
            {yearsAgoLabel}
          </p>
          <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
            {mode === "day" ? "Un día como hoy, " : ""}
            {periodLabel}
          </h2>
        </div>
      )}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-white/5 bg-spotify-dark-gray">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-spotify-light-gray">
                <Music2 className="h-4 w-4" />
                <span className="text-xs">Reproducciones</span>
              </div>
              <p className="mt-1 text-lg font-bold text-white">
                {formatReproductionCount(data!.summary.play_count)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-spotify-dark-gray">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-spotify-light-gray">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Tiempo</span>
              </div>
              <p className="mt-1 text-lg font-bold text-white">
                {formatMs(data!.summary.total_ms)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-spotify-dark-gray">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-spotify-light-gray">
                <Disc3 className="h-4 w-4" />
                <span className="text-xs">Canciones</span>
              </div>
              <p className="mt-1 text-lg font-bold text-white">
                {formatReproductionCount(data!.summary.unique_tracks)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-spotify-dark-gray">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-spotify-light-gray">
                <Users className="h-4 w-4" />
                <span className="text-xs">Artistas</span>
              </div>
              <p className="mt-1 text-lg font-bold text-white">
                {formatReproductionCount(data!.summary.unique_artists)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Content sections */}
      <div
        className={cn(
          "flex-1 space-y-6 transition-opacity duration-300 sm:space-y-8",
          loading && "pointer-events-none opacity-60",
        )}
      >
        {loading ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <Skeleton className="mb-4 h-5 w-32" />
                <SectionSkeleton rows={5} />
              </CardContent>
            </Card>
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <Skeleton className="mb-4 h-5 w-32" />
                <SectionSkeleton rows={5} />
              </CardContent>
            </Card>
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <Skeleton className="mb-4 h-5 w-32" />
                <SectionSkeleton rows={5} />
              </CardContent>
            </Card>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-spotify-medium-gray">
              <CalendarDays className="h-8 w-8 text-spotify-light-gray/50" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Sin recuerdos para esta fecha
            </h3>
            <p className="mt-2 max-w-sm text-sm text-spotify-light-gray">
              {selectedYear != null
                ? `No hay datos de escucha para ${periodLabel}. Probá girando la rueda para explorar otros años.`
                : "Cargando años disponibles..."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Tracks */}
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Music2 className="h-4 w-4 text-spotify-green" />
                  <h3 className="text-sm font-semibold text-white">
                    Top Canciones
                  </h3>
                </div>
                {data!.tracks.length > 0 ? (
                  <div className="-mx-3 divide-y divide-white/[0.03]">
                    {data!.tracks.map((t, i) => (
                      <TrackRow key={t.id} track={t} rank={i + 1} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-spotify-light-gray/50">
                    Sin datos
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Artists */}
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-spotify-green" />
                  <h3 className="text-sm font-semibold text-white">
                    Top Artistas
                  </h3>
                </div>
                {data!.artists.length > 0 ? (
                  <div className="-mx-3 divide-y divide-white/[0.03]">
                    {data!.artists.map((a, i) => (
                      <ArtistRow key={a.id} artist={a} rank={i + 1} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-spotify-light-gray/50">
                    Sin datos
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Albums */}
            <Card className="border-white/5 bg-spotify-dark-gray">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Library className="h-4 w-4 text-spotify-green" />
                  <h3 className="text-sm font-semibold text-white">
                    Top Álbumes
                  </h3>
                </div>
                {data!.albums.length > 0 ? (
                  <div className="-mx-3 divide-y divide-white/[0.03]">
                    {data!.albums.map((a, i) => (
                      <AlbumRow key={a.id} album={a} rank={i + 1} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-spotify-light-gray/50">
                    Sin datos
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Year Wheel - fixed at bottom */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-spotify-black/90 supports-[backdrop-filter]:bg-spotify-black/80 supports-[backdrop-filter]:backdrop-blur-lg lg:left-64">
        {yearsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Skeleton className="h-8 w-48" />
          </div>
        ) : yearsArray.length > 0 && selectedYear != null ? (
          <YearWheel
            years={yearsArray}
            selectedYear={selectedYear}
            onChange={setSelectedYear}
          />
        ) : (
          <p className="py-6 text-center text-sm text-spotify-light-gray/50">
            No hay años con datos de escucha
          </p>
        )}
      </div>
    </div>
  );
}
