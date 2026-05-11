"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { TimeFilterControl } from "@/components/stats/time-filter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Music2,
  Loader2,
  Search,
} from "lucide-react";
import { cn, formatMs, formatNumber } from "@/lib/utils";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";
import type { TimeFilterParams, TopItem } from "@/types/database";

const PAGE_SIZE = 36;

function filterToQuery(ft: TimeFilterParams): URLSearchParams {
  const p = new URLSearchParams();
  p.set("filter", ft.filter);
  if (ft.year != null) p.set("year", String(ft.year));
  if (ft.month != null) p.set("month", String(ft.month));
  return p;
}

export default function ArtistsPage() {
  const [timeFilter, setTimeFilter] = useState<TimeFilterParams>({
    filter: "all",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracksByArtist, setTracksByArtist] = useState<Record<string, TopItem[]>>({});
  const [tracksLoading, setTracksLoading] = useState<string | null>(null);
  const [tracksError, setTracksError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const baseQs = useMemo(
    () => filterToQuery(timeFilter).toString(),
    [timeFilter]
  );

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const qp = filterToQuery(timeFilter);
        qp.set("offset", String(nextOffset));
        qp.set("limit", String(PAGE_SIZE));
        if (debouncedSearch) qp.set("q", debouncedSearch);

        const res = await fetch(`/api/artists?${qp.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const list = data.artists || [];
        if (append) {
          setRows((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            const merged = [...prev];
            for (const a of list) {
              if (!seen.has(a.id)) {
                seen.add(a.id);
                merged.push(a);
              }
            }
            return merged;
          });
        } else {
          setRows(list);
        }
        setHasMore(Boolean(data.hasMore));
        setOffset(nextOffset + list.length);
      } catch {
        if (!append) setRows([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [timeFilter, debouncedSearch]
  );

  useEffect(() => {
    setOffset(0);
    loadPage(0, false);
  }, [loadPage]);

  async function toggleExpand(artistId: string) {
    if (expandedId === artistId) {
      setExpandedId(null);
      setTracksError(null);
      return;
    }
    setExpandedId(artistId);
    setTracksError(null);
    if (tracksByArtist[artistId]?.length) return;

    setTracksLoading(artistId);
    try {
      const qp = filterToQuery(timeFilter);
      const res = await fetch(
        `/api/artists/${encodeURIComponent(artistId)}/tracks?${qp.toString()}`
      );
      if (!res.ok) throw new Error("tracks");
      const data = await res.json();
      setTracksByArtist((prev) => ({
        ...prev,
        [artistId]: data.tracks || [],
      }));
    } catch {
      setTracksError("No se pudieron cargar las canciones.");
    } finally {
      setTracksLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Artistas</h1>
        <p className="mt-1 text-sm text-spotify-light-gray">
          Ranking por reproducciones en el período elegido ({CHILE_TIMEZONE_LABEL}). Expandí cada
          fila para ver tus canciones más escuchadas de ese artista.
        </p>
      </div>

      <TimeFilterControl value={timeFilter} onChange={setTimeFilter} />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-light-gray/50" />
        <input
          type="search"
          placeholder="Buscar por nombre de artista…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-white/10 bg-spotify-dark-gray py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-spotify-light-gray/50 focus:border-spotify-green/50 focus:outline-none focus:ring-1 focus:ring-spotify-green/30"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs text-spotify-light-gray/70">
            {loading
              ? "Cargando…"
              : `${formatNumber(rows.length)} artista${rows.length === 1 ? "" : "s"} mostrado${rows.length === 1 ? "" : "s"}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-spotify-light-gray">
              No hay artistas en este período o con esa búsqueda.
            </p>
          ) : (
            rows.map((a, idx) => (
              <div
                key={a.id}
                className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]"
              >
                <button
                  type="button"
                  onClick={() => void toggleExpand(a.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
                >
                  <span className="w-6 text-center text-xs font-medium text-spotify-light-gray/50">
                    {idx + 1}
                  </span>
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-spotify-medium-gray">
                    {a.image_url ? (
                      <Image
                        src={a.image_url}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 className="h-4 w-4 text-spotify-light-gray" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{a.name}</p>
                    <p className="text-xs text-spotify-light-gray">
                      {formatNumber(a.play_count)} reproducciones ·{" "}
                      {formatMs(a.total_ms_played)}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-spotify-light-gray transition-transform",
                      expandedId === a.id && "rotate-180"
                    )}
                  />
                </button>

                <div className="flex gap-2 border-t border-white/5 px-3 py-2">
                  <Link
                    href={`/artists/${encodeURIComponent(a.id)}?${baseQs}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-spotify-green hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Ver detalle <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {expandedId === a.id && (
                  <div className="border-t border-white/5 bg-black/30 px-3 pb-3 pt-2">
                    {tracksLoading === a.id ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-spotify-light-gray">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando
                        canciones…
                      </div>
                    ) : tracksError && expandedId === a.id ? (
                      <p className="py-3 text-sm text-red-400/90">{tracksError}</p>
                    ) : (
                      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                        {(tracksByArtist[a.id] || []).length === 0 ? (
                          <li className="py-4 text-sm text-spotify-light-gray">
                            Sin canciones en este período.
                          </li>
                        ) : (
                          (tracksByArtist[a.id] || []).map((t, ti) => (
                            <li
                              key={`${t.id}-${ti}`}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
                            >
                              <span className="w-6 text-right text-xs text-spotify-light-gray/60">
                                {ti + 1}
                              </span>
                              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-spotify-medium-gray">
                                {t.image_url ? (
                                  <Image
                                    src={t.image_url}
                                    alt=""
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center">
                                    <Music2 className="h-3 w-3 text-spotify-light-gray" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-white">{t.name}</p>
                                <p className="truncate text-[11px] text-spotify-light-gray/75">
                                  {formatNumber(t.play_count)} reps ·{" "}
                                  {formatMs(t.total_ms_played)}
                                </p>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={loadingMore}
            onClick={() => loadPage(offset, true)}
          >
            {loadingMore ? "Cargando…" : "Cargar más artistas"}
          </Button>
        </div>
      )}
    </div>
  );
}
