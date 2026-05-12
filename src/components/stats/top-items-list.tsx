"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs, formatReproductionCount } from "@/lib/utils";
import { Music2 } from "lucide-react";
import type { TopItem } from "@/types/database";

interface TopItemsListProps {
  title: string;
  items: TopItem[];
  loading?: boolean;
  showIndex?: boolean;
}

export function TopItemsList({
  title,
  items,
  loading = false,
  showIndex = true,
}: TopItemsListProps) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="px-4 pt-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-3 pb-4 sm:p-6 sm:pt-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded" />
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
      <Card className="overflow-hidden">
        <CardHeader className="px-4 pt-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-4 sm:p-6 sm:pt-0">
          <p className="py-8 text-center text-sm text-spotify-light-gray">
            No data available. Import your listening history to see stats.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...items.map((i) => i.play_count));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-4 pt-5 sm:p-6">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-4 sm:p-6 sm:pt-0">
        {items.map((item, index) => {
          const barWidth = maxValue > 0 ? (item.play_count / maxValue) * 100 : 0;

          return (
            <div
              key={item.id}
              className="group relative flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/5 active:bg-white/10 sm:rounded-lg sm:p-2"
            >
              {showIndex && (
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-spotify-light-gray/60">
                  {index + 1}
                </span>
              )}

              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md sm:h-10 sm:w-10">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
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
                <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                  {item.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs text-spotify-light-gray">
                    {formatReproductionCount(item.play_count)} reproducciones
                  </span>
                  <span className="text-xs text-spotify-light-gray/40">·</span>
                  <span className="text-xs text-spotify-light-gray/60">
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
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
