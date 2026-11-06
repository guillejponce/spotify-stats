"use client";

import { useState } from "react";
import { ChevronDown, Music2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankedItem } from "@/lib/concert-stats";

function countLabel(count: number): string {
  return count === 1 ? "1 show" : `${count.toLocaleString("es-CL")} shows`;
}

export function ConcertRankList({
  title,
  items,
  hideTitle = false,
  initialCount = 10,
  activeId,
  onPick,
}: {
  title: string;
  items: RankedItem[];
  hideTitle?: boolean;
  initialCount?: number;
  activeId?: string | null;
  onPick?: (item: RankedItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = items[0]?.count ?? 0;
  const limited = !expanded && items.length > initialCount;
  const visible = limited ? items.slice(0, initialCount) : items;

  return (
    <Card className="overflow-hidden border-white/[0.06]">
      {!hideTitle && (
        <CardHeader className="px-4 pt-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={hideTitle ? "px-2 pb-3 pt-2 sm:px-3" : "space-y-1 px-2 pb-3 sm:p-6 sm:pt-0"}>
        {items.length === 0 ? (
          <p className="px-2 py-6 text-sm text-spotify-light-gray">Sin canciones cargadas en estos setlists.</p>
        ) : (
          <div className="space-y-1">
            {visible.map((item, index) => {
              const width = max > 0 ? (item.count / max) * 100 : 0;
              const active = activeId === item.matchId;
              const body = (
                <>
                  <span className="w-6 shrink-0 text-right text-sm tabular-nums text-spotify-light-gray/75">
                    {index + 1}
                  </span>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-spotify-medium-gray">
                    <Music2 className="h-4 w-4 text-spotify-light-gray" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-spotify-light-gray">
                      {item.detail ? `${item.detail} · ` : ""}
                      {countLabel(item.count)}
                    </p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-spotify-green/50" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                </>
              );
              const className = `flex w-full items-center gap-3 rounded-xl p-2.5 text-left ${
                active ? "bg-white/[0.08]" : onPick ? "hover:bg-white/[0.06]" : ""
              }`;
              return onPick ? (
                <button key={item.id} type="button" className={className} onClick={() => onPick(item)}>
                  {body}
                </button>
              ) : (
                <div key={item.id} className={className}>
                  {body}
                </div>
              );
            })}
            {limited && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white/90 hover:bg-white/[0.06]"
              >
                Ver más ({items.length - visible.length})
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
