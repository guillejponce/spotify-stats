"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface RankChangeBadgeProps {
  rank?: number;
  rankDelta?: number | null;
  prevRank?: number | null;
  className?: string;
  /** Si true, muestra el número de puesto junto a la flecha. */
  showRank?: boolean;
}

/**
 * Flecha de movimiento de ranking en los últimos 7 días.
 * delta > 0 subió, < 0 bajó, null = nuevo, undefined = sin datos de comparación.
 */
export function RankChangeBadge({
  rank,
  rankDelta,
  prevRank,
  className,
  showRank = true,
}: RankChangeBadgeProps) {
  const hasComparison = rankDelta !== undefined || prevRank !== undefined;
  const isNew =
    hasComparison &&
    (prevRank === null || prevRank === undefined) &&
    (rankDelta === null || rankDelta === undefined);
  const delta = rankDelta ?? null;

  let tone: "up" | "down" | "flat" | "new" | "none" = "none";
  if (isNew) tone = "new";
  else if (delta != null && delta > 0) tone = "up";
  else if (delta != null && delta < 0) tone = "down";
  else if (hasComparison) tone = "flat";

  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] flex-col items-center justify-center gap-0.5",
        className
      )}
      title={
        tone === "up"
          ? `Subió ${delta} puesto${delta === 1 ? "" : "s"} en 7 días`
          : tone === "down"
            ? `Bajó ${Math.abs(delta!)} puesto${Math.abs(delta!) === 1 ? "" : "s"} en 7 días`
            : tone === "new"
              ? "Nuevo en el ranking (7 días)"
              : tone === "flat"
                ? "Sin cambio en 7 días"
                : undefined
      }
    >
      {showRank && rank != null && (
        <span className="text-xs font-medium tabular-nums text-spotify-light-gray/50">
          {rank}
        </span>
      )}
      {tone === "up" && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-emerald-400">
          <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
          {delta}
        </span>
      )}
      {tone === "down" && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-rose-400">
          <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
          {Math.abs(delta!)}
        </span>
      )}
      {tone === "new" && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">
          new
        </span>
      )}
      {tone === "flat" && (
        <span className="inline-flex items-center text-[10px] text-spotify-light-gray/35">
          <Minus className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}
