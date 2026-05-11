"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMs, formatNumber } from "@/lib/utils";
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
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-spotify-light-gray">
            No data available. Import your listening history to see stats.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...items.map((i) => i.play_count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => {
          const barWidth = maxValue > 0 ? (item.play_count / maxValue) * 100 : 0;

          return (
            <div
              key={item.id}
              className="group relative flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
            >
              {showIndex && (
                <span className="w-6 text-right text-sm font-medium text-spotify-light-gray/60">
                  {index + 1}
                </span>
              )}

              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
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
                <p className="truncate text-sm font-medium text-white">
                  {item.name}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-spotify-light-gray">
                    {formatNumber(item.play_count)} plays
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
