"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RankChangeBadge } from "@/components/stats/rank-change-badge";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import { ArrowRight, ChevronDown, Music2 } from "lucide-react";
import type { TopItem } from "@/types/database";

interface TopItemsListProps {
  title: string;
  items: TopItem[];
  loading?: boolean;
  showIndex?: boolean;
  hideTitle?: boolean;
  /** Si devuelve una ruta, la fila navega al detalle. */
  hrefFor?: (item: TopItem) => string | undefined;
  /** Filas visibles antes de “Ver más”. Sin valor: todas. */
  initialCount?: number;
  /** Enlace al ranking completo. */
  moreHref?: string;
  moreLabel?: string;
}

export function TopItemsList({
  title,
  items,
  loading = false,
  showIndex = true,
  hideTitle = false,
  hrefFor,
  initialCount,
  moreHref,
  moreLabel = "Ver ranking completo",
}: TopItemsListProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <Card className="overflow-hidden border-white/[0.06]">
        {!hideTitle && (
          <CardHeader className="px-4 pt-5 sm:p-6">
            <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={cn("space-y-3 px-3 pb-4", hideTitle ? "pt-4" : "sm:p-6 sm:pt-0")}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="overflow-hidden border-white/[0.06]">
        {!hideTitle && (
          <CardHeader className="px-4 pt-5 sm:p-6">
            <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={cn("px-3 pb-4", hideTitle ? "pt-4" : "sm:p-6 sm:pt-0")}>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-spotify-light-gray">Sin datos en este período.</p>
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-spotify-green transition-colors hover:bg-spotify-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green"
            >
              Importar historial
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...items.map((i) => i.play_count));
  const limited = initialCount != null && !expanded && items.length > initialCount;
  const visible = limited ? items.slice(0, initialCount) : items;

  return (
    <Card className="overflow-hidden border-white/[0.06]">
      {!hideTitle && (
        <CardHeader className="px-4 pt-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn("space-y-1 px-2 pb-3 sm:px-3", hideTitle ? "pt-2" : "sm:p-6 sm:pt-0")}>
        {visible.map((item, index) => {
          const barWidth = maxValue > 0 ? (item.play_count / maxValue) * 100 : 0;
          const href = hrefFor?.(item);
          const Row = href ? Link : "div";

          return (
            <Row
              key={item.id}
              href={href as string}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl p-2.5 sm:p-2.5",
                href &&
                  "transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green active:bg-white/10",
              )}
            >
              {showIndex && (
                item.rank_delta !== undefined || item.prev_rank !== undefined ? (
                  <RankChangeBadge
                    rank={item.rank ?? index + 1}
                    rankDelta={item.rank_delta}
                    prevRank={item.prev_rank}
                    className="shrink-0"
                  />
                ) : (
                  <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-spotify-light-gray/75">
                    {item.rank ?? index + 1}
                  </span>
                )
              )}

              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md sm:h-10 sm:w-10">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
                    <Music2 className="h-4 w-4 text-spotify-light-gray" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                  {item.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs text-spotify-light-gray">
                    {formatReproductionCount(item.play_count)} reproducciones
                  </span>
                  <span className="text-xs text-spotify-light-gray/75" aria-hidden>·</span>
                  <span className="text-xs text-spotify-light-gray/80">
                    {formatMs(item.total_ms_played)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-spotify-green/40 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </Row>
          );
        })}
        {(limited || moreHref) && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2">
            {limited ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green"
              >
                Ver más ({items.length - visible.length})
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <span />
            )}
            {moreHref && (
              <Link
                href={moreHref}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-spotify-green transition-colors hover:bg-spotify-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green"
              >
                {moreLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
