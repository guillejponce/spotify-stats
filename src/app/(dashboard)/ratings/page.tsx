"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import {
  Star,
  Search,
  Music2,
  Disc3,
  Users,
  TrendingUp,
  Trash2,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Check,
  BarChart3,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { ratingSongKey } from "@/lib/rating-identity";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  artist_id?: string | null;
}

interface AlbumSearchResult {
  id: string;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  track_count: number;
}

interface SelectedAlbum {
  id: string;
  name: string;
  artist_name: string | null;
  image_url: string | null;
}

type RateMode = "track" | "album";
type RankingView = "songs" | "albums" | "artists";
type SortOption = "rating_desc" | "rating_asc" | "recent" | "name";

// ─── Small reusable components ──────────────────────────────────────────────

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
  const sizes = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6" };
  const gaps = { sm: "gap-0.5", md: "gap-0.5", lg: "gap-1" };

  return (
    <div className={cn("flex items-center", gaps[size])}>
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
              sizes[size],
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

function RatingDistributionBar({
  distribution,
}: {
  distribution: { rating: number; count: number }[];
}) {
  const max = Math.max(...distribution.map((d) => d.count), 1);
  const total = distribution.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-1.5">
      {distribution.map((d) => (
        <div key={d.rating} className="flex items-center gap-2">
          <span className="w-5 text-right text-xs text-spotify-light-gray">
            {d.rating}
          </span>
          <Star className="h-3 w-3 fill-spotify-green text-spotify-green" />
          <div className="flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-spotify-green/60 to-spotify-green transition-all"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right text-[11px] text-spotify-light-gray">
            {d.count}{" "}
            <span className="text-spotify-light-gray/50">
              ({total > 0 ? Math.round((d.count / total) * 100) : 0}%)
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const emoji = ["🥇", "🥈", "🥉"][rank - 1];
    return <span className="w-5 text-center text-sm">{emoji}</span>;
  }
  return (
    <span className="w-5 text-right text-xs font-medium text-spotify-light-gray/50">
      {rank}
    </span>
  );
}

function RatingBadge({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "md";
}) {
  const color =
    value >= 8
      ? "bg-spotify-green/15 text-spotify-green"
      : value >= 5
        ? "bg-yellow-500/15 text-yellow-400"
        : "bg-red-500/15 text-red-400";
  return (
    <span
      className={cn(
        "shrink-0 rounded-md font-bold",
        color,
        size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"
      )}
    >
      {value}
    </span>
  );
}

function Thumb({
  url,
  fallback: Icon,
  rounded = "rounded-md",
  size = "h-10 w-10",
}: {
  url: string | null;
  fallback: typeof Music2;
  rounded?: string;
  size?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-spotify-medium-gray",
        rounded,
        size
      )}
    >
      {url ? (
        <Image src={url} alt="" fill className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Icon className="h-4 w-4 text-spotify-light-gray" />
        </div>
      )}
    </div>
  );
}

// ─── Main page component ────────────────────────────────────────────────────

export default function RatingsPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  // Rate tab
  const [rateMode, setRateMode] = useState<RateMode>("track");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [albumResults, setAlbumResults] = useState<AlbumSearchResult[]>([]);
  const [albumSearchLoading, setAlbumSearchLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<SelectedAlbum | null>(
    null
  );
  const [albumTracks, setAlbumTracks] = useState<SearchTrack[]>([]);
  const [albumTracksLoading, setAlbumTracksLoading] = useState(false);
  const [savingTrack, setSavingTrack] = useState<string | null>(null);

  // Rankings tab
  const [rankingView, setRankingView] = useState<RankingView>("songs");
  const [ratedList, setRatedList] = useState<SongRating[]>([]);
  const [ratedTotal, setRatedTotal] = useState(0);
  const [ratedOffset, setRatedOffset] = useState(0);
  const [ratedLoading, setRatedLoading] = useState(true);
  const [ratedHasMore, setRatedHasMore] = useState(false);
  const [ratedSort, setRatedSort] = useState<SortOption>("rating_desc");
  const [deletingTrack, setDeletingTrack] = useState<string | null>(null);
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);

  // Compare
  const [compareAlbums, setCompareAlbums] = useState<RatedAlbum[]>([]);
  const [compareArtists, setCompareArtists] = useState<RatedArtist[]>([]);

  // ── data fetching ─────────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch("/api/ratings/dashboard");
      if (res.ok) setDashboard(await res.json());
    } catch {
      /* ignore */
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (rateMode !== "track" || debouncedSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    fetch(`/api/ratings/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((d) => setSearchResults(d.tracks || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch, rateMode]);

  useEffect(() => {
    if (rateMode !== "album" || debouncedSearch.length < 2) {
      setAlbumResults([]);
      return;
    }
    setAlbumSearchLoading(true);
    fetch(`/api/ratings/albums/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((d) => setAlbumResults(d.albums || []))
      .catch(() => setAlbumResults([]))
      .finally(() => setAlbumSearchLoading(false));
  }, [debouncedSearch, rateMode]);

  useEffect(() => {
    if (!selectedAlbum) {
      setAlbumTracks([]);
      return;
    }
    setAlbumTracksLoading(true);
    fetch(
      `/api/ratings/albums/${encodeURIComponent(selectedAlbum.id)}/tracks`
    )
      .then((r) => r.json())
      .then((d) => setAlbumTracks(d.tracks || []))
      .catch(() => setAlbumTracks([]))
      .finally(() => setAlbumTracksLoading(false));
  }, [selectedAlbum]);

  const loadRated = useCallback(
    async (offset: number, append: boolean) => {
      if (!append) setRatedLoading(true);
      try {
        const res = await fetch(
          `/api/ratings?offset=${offset}&limit=37&sort=${ratedSort}`
        );
        const data = await res.json();
        const list: SongRating[] = data.tracks || [];
        setRatedHasMore(list.length > 36);
        const trimmed = list.slice(0, 36);
        if (append) setRatedList((p) => [...p, ...trimmed]);
        else setRatedList(trimmed);
        setRatedTotal(data.total ?? 0);
        setRatedOffset(offset + trimmed.length);
      } catch {
        /* ignore */
      } finally {
        setRatedLoading(false);
      }
    },
    [ratedSort]
  );

  useEffect(() => {
    void loadRated(0, false);
  }, [loadRated]);

  // ── handlers ──────────────────────────────────────────────────

  function syncRatingInLists(track: SearchTrack, rating: number) {
    const key = ratingSongKey(track.name, track.artist_id ?? null);
    const apply = (t: SearchTrack) =>
      ratingSongKey(t.name, t.artist_id ?? null) === key
        ? { ...t, current_rating: rating }
        : t;
    setSearchResults((p) => p.map(apply));
    setAlbumTracks((p) => p.map(apply));
  }

  async function handleRate(track: SearchTrack, rating: number) {
    setSavingTrack(track.id);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, rating }),
      });
      if (res.ok) {
        syncRatingInLists(track, rating);
        void fetchDashboard();
        void loadRated(0, false);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingTrack(null);
    }
  }

  function switchRateMode(mode: RateMode) {
    setRateMode(mode);
    setSearch("");
    setDebouncedSearch("");
    setSearchResults([]);
    setAlbumResults([]);
    setSelectedAlbum(null);
    setAlbumTracks([]);
  }

  async function handleDelete(trackId: string) {
    setDeletingTrack(trackId);
    try {
      const res = await fetch(
        `/api/ratings/${encodeURIComponent(trackId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setRatedList((p) => p.filter((r) => r.track_id !== trackId));
        setRatedTotal((p) => p - 1);
        void fetchDashboard();
      }
    } catch {
      /* ignore */
    } finally {
      setDeletingTrack(null);
    }
  }

  function toggleCompareAlbum(album: RatedAlbum) {
    setCompareAlbums((prev) => {
      if (prev.find((a) => a.album_id === album.album_id))
        return prev.filter((a) => a.album_id !== album.album_id);
      if (prev.length >= 2) return [prev[1], album];
      return [...prev, album];
    });
  }

  function toggleCompareArtist(artist: RatedArtist) {
    setCompareArtists((prev) => {
      if (prev.find((a) => a.artist_id === artist.artist_id))
        return prev.filter((a) => a.artist_id !== artist.artist_id);
      if (prev.length >= 2) return [prev[1], artist];
      return [...prev, artist];
    });
  }

  const albumProgress = useMemo(() => {
    if (!albumTracks.length) return null;
    const rated = albumTracks.filter((t) => t.current_rating != null);
    const avg =
      rated.length > 0
        ? Math.round(
            (rated.reduce((s, t) => s + (t.current_rating ?? 0), 0) /
              rated.length) *
              10
          ) / 10
        : 0;
    return { rated: rated.length, total: albumTracks.length, avg };
  }, [albumTracks]);

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Valoraciones
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-spotify-light-gray sm:mt-1">
          Rateá canciones del 1 al 10. Singles y versiones de álbum comparten
          nota. Rankings calculados por promedio.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        defaultValue="dashboard"
      >
        <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-1">
          <TabsList className="inline-flex w-max flex-nowrap gap-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="rate">Valorar</TabsTrigger>
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
          </TabsList>
        </div>

        {/* ────────────── DASHBOARD ────────────── */}
        <TabsContent value="dashboard">
          <DashboardTab data={dashboard} loading={dashLoading} />
        </TabsContent>

        {/* ────────────── RATE ────────────── */}
        <TabsContent value="rate">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-white/10 bg-spotify-dark-gray p-1">
              {(["track", "album"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchRateMode(m)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    rateMode === m
                      ? "bg-spotify-green text-black"
                      : "text-spotify-light-gray hover:text-white"
                  )}
                >
                  {m === "track" ? "Por canción" : "Por álbum"}
                </button>
              ))}
            </div>

            <div className="relative w-full max-w-none sm:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-light-gray/50" />
              <input
                type="search"
                placeholder={
                  rateMode === "track"
                    ? "Buscá una canción para valorar…"
                    : "Buscá un álbum para valorar sus canciones…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full border border-white/10 bg-spotify-dark-gray py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-spotify-light-gray/50 focus:border-spotify-green/50 focus:outline-none focus:ring-1 focus:ring-spotify-green/30"
              />
            </div>

            {/* Track search results */}
            {rateMode === "track" && (
              <>
                {searchLoading && <LoadingLine text="Buscando…" />}
                {!searchLoading &&
                  debouncedSearch.length >= 2 &&
                  searchResults.length === 0 && (
                    <EmptyText>
                      No se encontraron canciones con &ldquo;{debouncedSearch}
                      &rdquo;.
                    </EmptyText>
                  )}
                {searchResults.length > 0 && (
                  <TrackRatingList
                    tracks={searchResults}
                    savingTrack={savingTrack}
                    onRate={handleRate}
                  />
                )}
                {debouncedSearch.length < 2 && (
                  <EmptyState icon={Star}>
                    Escribí el nombre de una canción para buscarla y valorarla.
                  </EmptyState>
                )}
              </>
            )}

            {/* Album search + selected album */}
            {rateMode === "album" && (
              <>
                {selectedAlbum && (
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-spotify-dark-gray/80">
                    <div className="flex items-center gap-4 p-4">
                      <Thumb
                        url={selectedAlbum.image_url}
                        fallback={Disc3}
                        size="h-16 w-16"
                        rounded="rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">
                          {selectedAlbum.name}
                        </p>
                        <p className="truncate text-xs text-spotify-light-gray">
                          {selectedAlbum.artist_name}
                        </p>
                        {albumProgress && albumProgress.total > 0 && (
                          <div className="mt-2">
                            <div className="mb-1 flex items-center justify-between text-[11px]">
                              <span className="text-spotify-light-gray">
                                {albumProgress.rated}/{albumProgress.total}{" "}
                                valoradas
                              </span>
                              {albumProgress.avg > 0 && (
                                <span className="font-semibold text-spotify-green">
                                  Promedio: {albumProgress.avg}
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  albumProgress.rated === albumProgress.total
                                    ? "bg-spotify-green"
                                    : "bg-spotify-green/70"
                                )}
                                style={{
                                  width: `${(albumProgress.rated / albumProgress.total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setSelectedAlbum(null);
                          setAlbumTracks([]);
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                    {albumProgress?.rated === albumProgress?.total &&
                      (albumProgress?.total ?? 0) > 0 && (
                        <div className="flex items-center gap-2 border-t border-spotify-green/20 bg-spotify-green/5 px-4 py-2 text-xs font-medium text-spotify-green">
                          <Check className="h-3.5 w-3.5" /> Álbum completo
                        </div>
                      )}
                  </div>
                )}

                {!selectedAlbum && albumSearchLoading && (
                  <LoadingLine text="Buscando álbumes…" />
                )}
                {!selectedAlbum &&
                  !albumSearchLoading &&
                  debouncedSearch.length >= 2 &&
                  albumResults.length === 0 && (
                    <EmptyText>
                      No se encontraron álbumes con &ldquo;{debouncedSearch}
                      &rdquo;.
                    </EmptyText>
                  )}

                {!selectedAlbum && albumResults.length > 0 && (
                  <Card>
                    <CardContent className="divide-y divide-white/5 px-3 py-2 sm:px-4">
                      {albumResults.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() =>
                            setSelectedAlbum({
                              id: album.id,
                              name: album.name,
                              artist_name: album.artist_name,
                              image_url: album.image_url,
                            })
                          }
                          className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-white/5"
                        >
                          <Thumb url={album.image_url} fallback={Disc3} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {album.name}
                            </p>
                            <p className="truncate text-xs text-spotify-light-gray">
                              {album.artist_name}
                              {album.track_count > 0 && (
                                <span className="text-spotify-light-gray/50">
                                  {" · "}
                                  {album.track_count} canción
                                  {album.track_count === 1 ? "" : "es"}
                                </span>
                              )}
                            </p>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {selectedAlbum && albumTracksLoading && (
                  <LoadingLine text="Cargando canciones…" />
                )}
                {selectedAlbum &&
                  !albumTracksLoading &&
                  albumTracks.length === 0 && (
                    <EmptyText>
                      No hay canciones de este álbum en tu biblioteca local.
                    </EmptyText>
                  )}
                {selectedAlbum && albumTracks.length > 0 && (
                  <TrackRatingList
                    tracks={albumTracks}
                    savingTrack={savingTrack}
                    onRate={handleRate}
                    numbered
                  />
                )}

                {!selectedAlbum && debouncedSearch.length < 2 && (
                  <EmptyState icon={Disc3}>
                    Buscá un álbum por nombre y elegí uno para valorar todas sus
                    canciones.
                  </EmptyState>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ────────────── RANKINGS ────────────── */}
        <TabsContent value="rankings">
          <div className="space-y-4">
            {/* sub-tabs */}
            <div className="inline-flex rounded-full border border-white/10 bg-spotify-dark-gray p-1">
              {(
                [
                  ["songs", "Canciones", Music2],
                  ["albums", "Álbumes", Disc3],
                  ["artists", "Artistas", Users],
                ] as const
              ).map(([val, label, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRankingView(val)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    rankingView === val
                      ? "bg-spotify-green text-black"
                      : "text-spotify-light-gray hover:text-white"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Songs ranking */}
            {rankingView === "songs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-spotify-light-gray/70">
                    {ratedLoading
                      ? "Cargando…"
                      : `${formatNumber(ratedTotal)} canción${ratedTotal === 1 ? "" : "es"} valorada${ratedTotal === 1 ? "" : "s"}`}
                  </p>
                  <div className="w-48">
                    <Select
                      value={ratedSort}
                      onChange={(e) =>
                        setRatedSort(e.target.value as SortOption)
                      }
                      options={[
                        { value: "rating_desc", label: "Mejor puntuadas" },
                        { value: "rating_asc", label: "Peor puntuadas" },
                        { value: "recent", label: "Recientes" },
                        { value: "name", label: "Nombre A-Z" },
                      ]}
                    />
                  </div>
                </div>

                {ratedLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : ratedList.length === 0 ? (
                  <EmptyState icon={Star}>
                    Aún no valoraste ninguna canción.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {ratedList.map((r, idx) => (
                      <li
                        key={r.track_id}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <RankBadge rank={idx + 1} />
                          <Thumb url={r.image_url} fallback={Music2} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                              {r.track_name}
                            </p>
                            <p className="truncate text-xs text-spotify-light-gray">
                              {r.artist_name}
                              {r.album_name && (
                                <span className="text-spotify-light-gray/50">
                                  {" · "}
                                  {r.album_name}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pl-13 sm:pl-0">
                          <StarRating
                            value={r.rating}
                            onChange={(v) =>
                              void handleRate(
                                {
                                  id: r.track_id,
                                  name: r.track_name,
                                  artist_name: r.artist_name,
                                  album_name: r.album_name,
                                  image_url: r.image_url,
                                  current_rating: r.rating,
                                  artist_id: r.artist_id,
                                },
                                v
                              )
                            }
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
            )}

            {/* Albums ranking */}
            {rankingView === "albums" && (
              <div className="space-y-4">
                {compareAlbums.length === 2 && (
                  <ComparePanel
                    items={compareAlbums.map((a) => ({
                      id: a.album_id,
                      name: a.album_name,
                      subtitle: a.artist_name,
                      image_url: a.image_url,
                      avg_rating: a.avg_rating,
                      count: a.rated_tracks,
                    }))}
                    onRemove={(id) =>
                      setCompareAlbums((p) =>
                        p.filter((a) => a.album_id !== id)
                      )
                    }
                    onClear={() => setCompareAlbums([])}
                  />
                )}

                {!dashboard || dashboard.topAlbums.length === 0 ? (
                  <EmptyState icon={Disc3}>
                    Valorá canciones de álbumes para ver rankings acá.
                  </EmptyState>
                ) : (
                  <div className="space-y-2">
                    {dashboard.topAlbums.map((a, idx) => (
                      <ExpandableAlbumRow
                        key={a.album_id}
                        album={a}
                        rank={idx + 1}
                        isExpanded={expandedAlbum === a.album_id}
                        onToggle={() =>
                          setExpandedAlbum(
                            expandedAlbum === a.album_id ? null : a.album_id
                          )
                        }
                        isComparing={
                          !!compareAlbums.find(
                            (c) => c.album_id === a.album_id
                          )
                        }
                        onToggleCompare={() => toggleCompareAlbum(a)}
                        onRate={handleRate}
                        savingTrack={savingTrack}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Artists ranking */}
            {rankingView === "artists" && (
              <div className="space-y-4">
                {compareArtists.length === 2 && (
                  <ComparePanel
                    items={compareArtists.map((a) => ({
                      id: a.artist_id,
                      name: a.artist_name,
                      subtitle: `${a.rated_tracks} canción${a.rated_tracks === 1 ? "" : "es"}`,
                      image_url: a.image_url,
                      avg_rating: a.avg_rating,
                      count: a.rated_tracks,
                    }))}
                    onRemove={(id) =>
                      setCompareArtists((p) =>
                        p.filter((a) => a.artist_id !== id)
                      )
                    }
                    onClear={() => setCompareArtists([])}
                  />
                )}

                {!dashboard || dashboard.topArtists.length === 0 ? (
                  <EmptyState icon={Users}>
                    Valorá canciones para ver los promedios por artista.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {dashboard.topArtists.map((a, idx) => {
                      const comparing = !!compareArtists.find(
                        (c) => c.artist_id === a.artist_id
                      );
                      return (
                        <li
                          key={a.artist_id}
                          className="flex items-center gap-3 py-3"
                        >
                          <RankBadge rank={idx + 1} />
                          <Thumb
                            url={a.image_url}
                            fallback={Users}
                            rounded="rounded-full"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {a.artist_name}
                            </p>
                            <p className="truncate text-[11px] text-spotify-light-gray/70">
                              {a.rated_tracks} canción
                              {a.rated_tracks === 1 ? "" : "es"} valorada
                              {a.rated_tracks === 1 ? "" : "s"}
                            </p>
                          </div>
                          <RatingBadge value={a.avg_rating} />
                          <button
                            type="button"
                            onClick={() => toggleCompareArtist(a)}
                            className={cn(
                              "rounded-full p-1.5 transition-colors",
                              comparing
                                ? "bg-spotify-green/20 text-spotify-green"
                                : "text-spotify-light-gray/40 hover:bg-white/5 hover:text-white"
                            )}
                            title="Comparar"
                          >
                            {comparing ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────────────────────────

function DashboardTab({
  data,
  loading,
}: {
  data: DashboardData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data || data.totalRated === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-spotify-green/10">
          <Star className="h-10 w-10 text-spotify-green/40" />
        </div>
        <p className="text-lg font-medium text-white">Sin valoraciones aún</p>
        <p className="max-w-sm text-sm text-spotify-light-gray">
          Andá a la pestaña &ldquo;Valorar&rdquo; para empezar a armar tu
          ranking personal.
        </p>
      </div>
    );
  }

  const bestAlbum = data.topAlbums[0];
  const bestArtist = data.topArtists[0];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Music2}
          value={formatNumber(data.totalRated)}
          label="Canciones valoradas"
        />
        <StatCard
          icon={Star}
          value={`${data.avgRating}/10`}
          label="Promedio general"
        />
        <StatCard
          icon={Disc3}
          value={bestAlbum ? String(bestAlbum.avg_rating) : "—"}
          label={bestAlbum ? bestAlbum.album_name : "Mejor álbum"}
          sublabel={bestAlbum?.artist_name ?? undefined}
        />
        <StatCard
          icon={Users}
          value={bestArtist ? String(bestArtist.avg_rating) : "—"}
          label={bestArtist ? bestArtist.artist_name : "Mejor artista"}
          sublabel={
            bestArtist
              ? `${bestArtist.rated_tracks} canción${bestArtist.rated_tracks === 1 ? "" : "es"}`
              : undefined
          }
        />
      </div>

      {/* Top tracks + distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-spotify-green" />
              Top canciones
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto px-3 pb-4 pt-0">
            <ul className="divide-y divide-white/5">
              {data.topTracks.slice(0, 15).map((t, idx) => (
                <li
                  key={t.track_id}
                  className="flex items-center gap-2.5 py-2"
                >
                  <RankBadge rank={idx + 1} />
                  <Thumb url={t.image_url} fallback={Music2} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {t.track_name}
                    </p>
                    <p className="truncate text-[11px] text-spotify-light-gray/70">
                      {t.artist_name}
                    </p>
                  </div>
                  <RatingBadge value={t.rating} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-spotify-green" />
              Distribución de notas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <RatingDistributionBar distribution={data.distribution} />
          </CardContent>
        </Card>
      </div>

      {/* Top albums + artists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Disc3 className="h-4 w-4 text-spotify-green" />
              Top álbumes
              <span className="ml-auto text-[11px] font-normal text-spotify-light-gray/50">
                promedio
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto px-3 pb-4 pt-0">
            {data.topAlbums.length === 0 ? (
              <p className="py-6 text-center text-sm text-spotify-light-gray">
                Valorá canciones de álbumes para ver rankings acá.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {data.topAlbums.slice(0, 15).map((a, idx) => (
                  <li
                    key={a.album_id}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <RankBadge rank={idx + 1} />
                    <Thumb url={a.image_url} fallback={Disc3} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">
                        {a.album_name}
                      </p>
                      <p className="truncate text-[11px] text-spotify-light-gray/70">
                        {a.artist_name} · {a.rated_tracks} canción
                        {a.rated_tracks === 1 ? "" : "es"}
                      </p>
                    </div>
                    <RatingBadge value={a.avg_rating} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-spotify-green" />
              Top artistas
              <span className="ml-auto text-[11px] font-normal text-spotify-light-gray/50">
                promedio
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto px-3 pb-4 pt-0">
            {data.topArtists.length === 0 ? (
              <p className="py-6 text-center text-sm text-spotify-light-gray">
                Valorá canciones para ver los promedios por artista.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {data.topArtists.slice(0, 15).map((a, idx) => (
                  <li
                    key={a.artist_id}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <RankBadge rank={idx + 1} />
                    <Thumb
                      url={a.image_url}
                      fallback={Users}
                      size="h-8 w-8"
                      rounded="rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">
                        {a.artist_name}
                      </p>
                      <p className="truncate text-[11px] text-spotify-light-gray/70">
                        {a.rated_tracks} canción
                        {a.rated_tracks === 1 ? "" : "es"} valorada
                        {a.rated_tracks === 1 ? "" : "s"}
                      </p>
                    </div>
                    <RatingBadge value={a.avg_rating} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      {data.recentRatings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-spotify-green" />
              Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4 pt-0">
            <ul className="divide-y divide-white/5">
              {data.recentRatings.map((r) => (
                <li
                  key={r.track_id}
                  className="flex items-center gap-2.5 py-2"
                >
                  <Thumb url={r.image_url} fallback={Music2} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {r.track_name}
                    </p>
                    <p className="truncate text-[11px] text-spotify-light-gray/70">
                      {r.artist_name}
                    </p>
                  </div>
                  <RatingBadge value={r.rating} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Reusable pieces ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  sublabel,
}: {
  icon: typeof Star;
  value: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-4">
        <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-spotify-green/5" />
        <Icon className="h-5 w-5 text-spotify-green" />
        <p className="mt-2 text-2xl font-bold text-white">{value}</p>
        <p className="truncate text-[11px] text-spotify-light-gray">{label}</p>
        {sublabel && (
          <p className="truncate text-[10px] text-spotify-light-gray/50">
            {sublabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrackRatingList({
  tracks,
  savingTrack,
  onRate,
  numbered,
}: {
  tracks: SearchTrack[];
  savingTrack: string | null;
  onRate: (track: SearchTrack, rating: number) => void;
  numbered?: boolean;
}) {
  return (
    <Card>
      <CardContent className="divide-y divide-white/5 px-3 py-2 sm:px-4">
        {tracks.map((track, idx) => (
          <div
            key={track.id}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {numbered && (
                <span className="w-5 text-right text-xs font-medium text-spotify-light-gray/50">
                  {idx + 1}
                </span>
              )}
              <Thumb url={track.image_url} fallback={Music2} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {track.name}
                </p>
                <p className="truncate text-xs text-spotify-light-gray">
                  {track.artist_name}
                  {track.album_name && (
                    <span className="text-spotify-light-gray/50">
                      {" · "}
                      {track.album_name}
                    </span>
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
                  onChange={(v) => void onRate(track, v)}
                  size="sm"
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExpandableAlbumRow({
  album,
  rank,
  isExpanded,
  onToggle,
  isComparing,
  onToggleCompare,
  onRate,
  savingTrack,
}: {
  album: RatedAlbum;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  isComparing: boolean;
  onToggleCompare: () => void;
  onRate: (track: SearchTrack, rating: number) => void;
  savingTrack: string | null;
}) {
  const [tracks, setTracks] = useState<SearchTrack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    setLoading(true);
    fetch(
      `/api/ratings/albums/${encodeURIComponent(album.album_id)}/tracks`
    )
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [isExpanded, album.album_id]);

  function handleRateTrack(track: SearchTrack, rating: number) {
    const key = ratingSongKey(track.name, track.artist_id ?? null);
    setTracks((p) =>
      p.map((t) =>
        ratingSongKey(t.name, t.artist_id ?? null) === key
          ? { ...t, current_rating: rating }
          : t
      )
    );
    onRate(track, rating);
  }

  const rated = tracks.filter((t) => t.current_rating != null);
  const avg =
    rated.length > 0
      ? Math.round(
          (rated.reduce((s, t) => s + (t.current_rating ?? 0), 0) /
            rated.length) *
            10
        ) / 10
      : 0;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        isExpanded && "border-spotify-green/30"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
      >
        <RankBadge rank={rank} />
        <Thumb url={album.image_url} fallback={Disc3} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {album.album_name}
          </p>
          <p className="truncate text-[11px] text-spotify-light-gray/70">
            {album.artist_name} · {album.rated_tracks} canción
            {album.rated_tracks === 1 ? "" : "es"}
          </p>
        </div>
        <RatingBadge value={album.avg_rating} size="md" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          className={cn(
            "rounded-full p-1.5 transition-colors",
            isComparing
              ? "bg-spotify-green/20 text-spotify-green"
              : "text-spotify-light-gray/40 hover:bg-white/5 hover:text-white"
          )}
          title="Comparar"
        >
          {isComparing ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </button>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-spotify-light-gray/50" />
        ) : (
          <ChevronDown className="h-4 w-4 text-spotify-light-gray/50" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-white/5 bg-white/[0.02] px-3 pb-4 pt-2">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-spotify-light-gray">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando
              canciones…
            </div>
          ) : tracks.length === 0 ? (
            <p className="py-4 text-center text-sm text-spotify-light-gray">
              Sin canciones en tu biblioteca local.
            </p>
          ) : (
            <>
              {tracks.length > 0 && rated.length > 0 && (
                <div className="mb-3 flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <span className="text-spotify-light-gray">
                    {rated.length}/{tracks.length} valoradas
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-spotify-green/70"
                      style={{
                        width: `${(rated.length / tracks.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="font-semibold text-spotify-green">
                    {avg}
                  </span>
                </div>
              )}
              <ul className="space-y-1">
                {tracks.map((t, idx) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
                  >
                    <span className="w-5 text-right text-[11px] text-spotify-light-gray/40">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{t.name}</p>
                    </div>
                    <div className="shrink-0">
                      {savingTrack === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-spotify-green" />
                      ) : (
                        <StarRating
                          value={t.current_rating ?? 0}
                          onChange={(v) => handleRateTrack(t, v)}
                          size="sm"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function ComparePanel({
  items,
  onRemove,
  onClear,
}: {
  items: {
    id: string;
    name: string;
    subtitle: string | null;
    image_url: string | null;
    avg_rating: number;
    count: number;
  }[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (items.length < 2) return null;
  const [a, b] = items;
  const diff = Math.abs(a.avg_rating - b.avg_rating);
  const winner =
    a.avg_rating > b.avg_rating ? a : b.avg_rating > a.avg_rating ? b : null;

  return (
    <Card className="border-spotify-green/20 bg-gradient-to-r from-spotify-green/[0.04] to-transparent">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-spotify-green">
            Comparación
          </p>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-spotify-light-gray/50 hover:text-white"
          >
            Limpiar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[a, b].map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <Thumb
                url={item.image_url}
                fallback={Disc3}
                size="h-12 w-12"
                rounded="rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {item.name}
                </p>
                <p className="truncate text-[11px] text-spotify-light-gray/70">
                  {item.subtitle}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-spotify-green text-spotify-green" />
                  <span className="text-lg font-bold text-spotify-green">
                    {item.avg_rating}
                  </span>
                  <span className="text-[11px] text-spotify-light-gray/50">
                    ({item.count} canción{item.count === 1 ? "" : "es"})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-full p-1 text-spotify-light-gray/30 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {diff > 0 && winner && (
          <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-center text-xs text-spotify-light-gray">
            <span className="font-semibold text-white">{winner.name}</span>{" "}
            supera por{" "}
            <span className="font-semibold text-spotify-green">
              {diff.toFixed(1)}
            </span>{" "}
            puntos
          </div>
        )}
        {diff === 0 && (
          <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-center text-xs text-spotify-light-gray">
            Empate perfecto en{" "}
            <span className="font-semibold text-spotify-green">
              {a.avg_rating}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  children,
}: {
  icon: typeof Star;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon className="h-12 w-12 text-spotify-green/30" />
      <p className="max-w-sm text-sm text-spotify-light-gray">{children}</p>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-spotify-light-gray">
      {children}
    </p>
  );
}

function LoadingLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-spotify-light-gray">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}
