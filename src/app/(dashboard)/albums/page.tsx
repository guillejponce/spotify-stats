"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { TimeFilterControl } from "@/components/stats/time-filter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Disc3, Loader2, Music2, Search } from "lucide-react";
import { formatMs, formatNumber } from "@/lib/utils";
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

export default function AlbumsPage() {
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

        const res = await fetch(`/api/albums?${qp.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const list = data.albums || [];
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Álbumes</h1>
        <p className="mt-1 text-sm text-spotify-light-gray">
          Álbumes más escuchados según el período ({CHILE_TIMEZONE_LABEL}). Tocá uno para ver el
          tracklist completo y cuántas reproducciones llevas en el rango.
        </p>
      </div>

      <TimeFilterControl value={timeFilter} onChange={setTimeFilter} />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-light-gray/50" />
        <input
          type="search"
          placeholder="Buscar por nombre de álbum…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-white/10 bg-spotify-dark-gray py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-spotify-light-gray/50 focus:border-spotify-green/50 focus:outline-none focus:ring-1 focus:ring-spotify-green/30"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Disc3 className="h-5 w-5 text-spotify-green" />
          <span className="text-lg font-semibold text-white">Ranking de álbumes</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-spotify-light-gray">
              No hay álbumes en este período con reproducciones que tengan disco asociado.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/albums/${encodeURIComponent(a.id)}?${baseQs}`}
                    className="flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-spotify-medium-gray">
                      {a.image_url ? (
                        <Image
                          src={a.image_url}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Music2 className="h-6 w-6 text-spotify-light-gray" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{a.name}</p>
                      <p className="text-xs text-spotify-light-gray">
                        {formatNumber(a.play_count)} reproducciones · {formatMs(a.total_ms_played)}
                      </p>
                    </div>
                    <span className="text-xs text-spotify-green/90">Ver tema a tema →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loadingMore}
                onClick={() => loadPage(offset, true)}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Cargar más"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
