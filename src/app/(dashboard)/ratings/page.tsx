"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Star,
  Search,
  Music2,
  Disc3,
  Users,
  TrendingUp,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface SongRating {
  track_id: string;
  rating: number;
  track_name: string;
  artist_name: string | null;
  album_name: string | null;
  album_id: string | null;
  artist_id: string | null;
  image_url: string | null;
  updated_at: string;
}

interface RatedAlbum {
  album_id: string;
  album_name: string;
  artist_name: string | null;
  image_url: string | null;
  avg_rating: number;
  rated_tracks: number;
}

interface RatedArtist {
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  avg_rating: number;
  rated_tracks: number;
}

interface DashboardData {
  totalRated: number;
  avgRating: number;
  topTracks: SongRating[];
  topAlbums: RatedAlbum[];
  topArtists: RatedArtist[];
  recentRatings: SongRating[];
  distribution: { rating: number; count: number }[];
}

interface SearchTrack {
  id: string;
  name: string;
  artist_name: string | null;
  album_name: string | null;
  image_url: string | null;
  current_rating: number | null;
}

function StarRating({
  value,
  onChange,
  size = "md",
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  readonly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const sizeClasses = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6" };
  const gapClasses = { sm: "gap-0.5", md: "gap-0.5", lg: "gap-1" };

  return (
    <div className={cn("flex items-center", gapClasses[size])}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={() => onChange?.(star)}
          className={cn(
            "transition-colors",
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110"
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              (hover || value) >= star
                ? "fill-spotify-green text-spotify-green"
                : "fill-transparent text-white/20"
            )}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1.5 text-sm font-semibold text-spotify-green">
          {value}/10
        </span>
      )}
    </div>
  );
}

function RatingDistributionBar({ distribution }: { distribution: { rating: number; count: number }[] }) {
  const max = Math.max(...distribution.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {distribution.map((d) => (
        <div key={d.rating} className="flex items-center gap-2">
          <span className="w-5 text-right text-xs text-spotify-light-gray">{d.rating}</span>
          <Star className="h-3 w-3 fill-spotify-green text-spotify-green" />
          <div className="flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-3 rounded-full bg-spotify-green/70 transition-all"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs text-spotify-light-gray">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function RatingsPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [savingTrack, setSavingTrack] = useState<string | null>(null);

  const [ratedList, setRatedList] = useState<SongRating[]>([]);
  const [ratedTotal, setRatedTotal] = useState(0);
  const [ratedOffset, setRatedOffset] = useState(0);
  const [ratedLoading, setRatedLoading] = useState(true);
  const [ratedHasMore, setRatedHasMore] = useState(false);
  const [deletingTrack, setDeletingTrack] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch("/api/ratings/dashboard");
      if (res.ok) setDashboard(await res.json());
    } catch { /* ignore */ }
    finally { setDashLoading(false); }
  }, []);

  useEffect(() => { void fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    fetch(`/api/ratings/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((d) => setSearchResults(d.tracks || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch]);

  const loadRated = useCallback(async (offset: number, append: boolean) => {
    if (!append) setRatedLoading(true);
    try {
      const res = await fetch(`/api/ratings?offset=${offset}&limit=37&sort=rating_desc`);
      const data = await res.json();
      const list: SongRating[] = data.tracks || [];
      setRatedHasMore(list.length > 36);
      const trimmed = list.slice(0, 36);
      if (append) setRatedList((p) => [...p, ...trimmed]);
      else setRatedList(trimmed);
      setRatedTotal(data.total ?? 0);
      setRatedOffset(offset + trimmed.length);
    } catch { /* ignore */ }
    finally { setRatedLoading(false); }
  }, []);

  useEffect(() => { void loadRated(0, false); }, [loadRated]);

  async function handleRate(trackId: string, rating: number) {
    setSavingTrack(trackId);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, rating }),
      });
      if (res.ok) {
        setSearchResults((prev) =>
          prev.map((t) => (t.id === trackId ? { ...t, current_rating: rating } : t))
        );
        void fetchDashboard();
        void loadRated(0, false);
      }
    } catch { /* ignore */ }
    finally { setSavingTrack(null); }
  }

  async function handleDelete(trackId: string) {
    setDeletingTrack(trackId);
    try {
      const res = await fetch(`/api/ratings/${encodeURIComponent(trackId)}`, { method: "DELETE" });
      if (res.ok) {
        setRatedList((prev) => prev.filter((r) => r.track_id !== trackId));
        setRatedTotal((p) => p - 1);
        void fetchDashboard();
      }
    } catch { /* ignore */ }
    finally { setDeletingTrack(null); }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Valoraciones
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-spotify-light-gray sm:mt-1">
          Rateá tus canciones del 1 al 10. Los álbumes y artistas se puntúan con el promedio de sus canciones.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="dashboard">
        <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-1">
          <TabsList className="inline-flex w-max flex-nowrap gap-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="rate">Valorar canciones</TabsTrigger>
            <TabsTrigger value="list">Mis valoraciones</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard">
          <DashboardTab data={dashboard} loading={dashLoading} />
        </TabsContent>

        <TabsContent value="rate">
          <div className="space-y-4">
            <div className="relative w-full max-w-none sm:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-light-gray/50" />
              <input
                type="search"
                placeholder="Buscá una canción para valorar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full border border-white/10 bg-spotify-dark-gray py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-spotify-light-gray/50 focus:border-spotify-green/50 focus:outline-none focus:ring-1 focus:ring-spotify-green/30"
              />
            </div>

            {searchLoading && (
              <div className="flex items-center gap-2 py-4 text-sm text-spotify-light-gray">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            )}

            {!searchLoading && debouncedSearch.length >= 2 && searchResults.length === 0 && (
              <p className="py-6 text-center text-sm text-spotify-light-gray">
                No se encontraron canciones con &ldquo;{debouncedSearch}&rdquo;.
              </p>
            )}

            {searchResults.length > 0 && (
              <Card>
                <CardContent className="divide-y divide-white/5 px-3 py-2 sm:px-4">
                  {searchResults.map((track) => (
                    <div
                      key={track.id}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-spotify-medium-gray">
                          {track.image_url ? (
                            <Image src={track.image_url} alt="" fill className="object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Music2 className="h-4 w-4 text-spotify-light-gray" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{track.name}</p>
                          <p className="truncate text-xs text-spotify-light-gray">
                            {track.artist_name}
                            {track.album_name && (
                              <span className="text-spotify-light-gray/50"> · {track.album_name}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-13 sm:pl-0">
                        {savingTrack === track.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
                        ) : (
                          <StarRating
                            value={track.current_rating ?? 0}
                            onChange={(v) => void handleRate(track.id, v)}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {debouncedSearch.length < 2 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Star className="h-12 w-12 text-spotify-green/30" />
                <p className="text-sm text-spotify-light-gray">
                  Escribí el nombre de una canción para buscarla y valorarla.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="list">
          <div className="space-y-4">
            <p className="text-xs text-spotify-light-gray/70">
              {ratedLoading ? "Cargando…" : `${formatNumber(ratedTotal)} canción${ratedTotal === 1 ? "" : "es"} valorada${ratedTotal === 1 ? "" : "s"}`}
            </p>

            {ratedLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : ratedList.length === 0 ? (
              <p className="py-10 text-center text-sm text-spotify-light-gray">
                Aún no valoraste ninguna canción.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {ratedList.map((r) => (
                  <li key={r.track_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-spotify-medium-gray">
                        {r.image_url ? (
                          <Image src={r.image_url} alt="" fill className="object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Music2 className="h-4 w-4 text-spotify-light-gray" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{r.track_name}</p>
                        <p className="truncate text-xs text-spotify-light-gray">
                          {r.artist_name}
                          {r.album_name && (
                            <span className="text-spotify-light-gray/50"> · {r.album_name}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-13 sm:pl-0">
                      <StarRating
                        value={r.rating}
                        onChange={(v) => void handleRate(r.track_id, v)}
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.track_id)}
                        disabled={deletingTrack === r.track_id}
                        className="ml-2 rounded-md p-1.5 text-spotify-light-gray/50 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        {deletingTrack === r.track_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {ratedHasMore && !ratedLoading && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[44px] w-full max-w-sm sm:min-h-0 sm:w-auto"
                  onClick={() => void loadRated(ratedOffset, true)}
                >
                  Cargar más
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.totalRated === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Star className="h-16 w-16 text-spotify-green/20" />
        <p className="text-lg font-medium text-white">Sin valoraciones aún</p>
        <p className="max-w-sm text-sm text-spotify-light-gray">
          Andá a la pestaña &ldquo;Valorar canciones&rdquo; para empezar a armar tu ranking personal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spotify-green/10">
              <Music2 className="h-5 w-5 text-spotify-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{formatNumber(data.totalRated)}</p>
              <p className="text-xs text-spotify-light-gray">Canciones valoradas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spotify-green/10">
              <Star className="h-5 w-5 text-spotify-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data.avgRating}</p>
              <p className="text-xs text-spotify-light-gray">Promedio general</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-spotify-green/10">
              <TrendingUp className="h-5 w-5 text-spotify-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {data.topTracks[0]?.rating ?? "—"}/10
              </p>
              <p className="truncate text-xs text-spotify-light-gray">
                Mejor: {data.topTracks[0]?.track_name ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music2 className="h-4 w-4 text-spotify-green" />
              Top canciones
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto px-3 pb-4 pt-0">
            <ul className="divide-y divide-white/5">
              {data.topTracks.slice(0, 15).map((t, idx) => (
                <li key={t.track_id} className="flex items-center gap-2.5 py-2">
                  <span className="w-5 text-right text-xs font-medium text-spotify-light-gray/50">
                    {idx + 1}
                  </span>
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
                    {t.image_url ? (
                      <Image src={t.image_url} alt="" fill className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Music2 className="h-3 w-3 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{t.track_name}</p>
                    <p className="truncate text-[11px] text-spotify-light-gray/70">{t.artist_name}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-spotify-green/10 px-2 py-0.5 text-xs font-bold text-spotify-green">
                    {t.rating}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-spotify-green" />
              Distribución de notas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <RatingDistributionBar distribution={data.distribution} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Disc3 className="h-4 w-4 text-spotify-green" />
              Top álbumes (promedio)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto px-3 pb-4 pt-0">
            {data.topAlbums.length === 0 ? (
              <p className="py-6 text-center text-sm text-spotify-light-gray">
                Valorá canciones de álbumes para ver rankings acá.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {data.topAlbums.slice(0, 15).map((a, idx) => (
                  <li key={a.album_id} className="flex items-center gap-2.5 py-2">
                    <span className="w-5 text-right text-xs font-medium text-spotify-light-gray/50">
                      {idx + 1}
                    </span>
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
                      {a.image_url ? (
                        <Image src={a.image_url} alt="" fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Disc3 className="h-3 w-3 text-spotify-light-gray" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{a.album_name}</p>
                      <p className="truncate text-[11px] text-spotify-light-gray/70">
                        {a.artist_name} · {a.rated_tracks} canción{a.rated_tracks === 1 ? "" : "es"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-spotify-green/10 px-2 py-0.5 text-xs font-bold text-spotify-green">
                      {a.avg_rating}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-spotify-green" />
              Top artistas (promedio)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto px-3 pb-4 pt-0">
            {data.topArtists.length === 0 ? (
              <p className="py-6 text-center text-sm text-spotify-light-gray">
                Valorá canciones para ver los promedios por artista.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {data.topArtists.slice(0, 15).map((a, idx) => (
                  <li key={a.artist_id} className="flex items-center gap-2.5 py-2">
                    <span className="w-5 text-right text-xs font-medium text-spotify-light-gray/50">
                      {idx + 1}
                    </span>
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-spotify-medium-gray">
                      {a.image_url ? (
                        <Image src={a.image_url} alt="" fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Users className="h-3 w-3 text-spotify-light-gray" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{a.artist_name}</p>
                      <p className="truncate text-[11px] text-spotify-light-gray/70">
                        {a.rated_tracks} canción{a.rated_tracks === 1 ? "" : "es"} valorada{a.rated_tracks === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-spotify-green/10 px-2 py-0.5 text-xs font-bold text-spotify-green">
                      {a.avg_rating}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {data.recentRatings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas valoraciones</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4 pt-0">
            <ul className="divide-y divide-white/5">
              {data.recentRatings.map((r) => (
                <li key={r.track_id} className="flex items-center gap-2.5 py-2">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
                    {r.image_url ? (
                      <Image src={r.image_url} alt="" fill className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Music2 className="h-3 w-3 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{r.track_name}</p>
                    <p className="truncate text-[11px] text-spotify-light-gray/70">{r.artist_name}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-spotify-green/10 px-2 py-0.5 text-xs font-bold text-spotify-green">
                    {r.rating}/10
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
