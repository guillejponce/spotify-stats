"use client";

import Link from "next/link";
import Image from "next/image";
import { Music2 } from "lucide-react";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import type { WrappedRace, WrappedRacer } from "@/types/wrapped";

function gapLabel(
  leader: WrappedRacer,
  item: WrappedRacer,
  locked: boolean,
): string {
  if (item.id === leader.id) return locked ? "campeón" : "va primero";
  const gap = Math.max(0, leader.play_count - item.play_count);
  if (gap === 0) return "empatado";
  return `a ${formatReproductionCount(gap)}`;
}

export function WrappedRaceBoard({ race }: { race: WrappedRace }) {
  const leader = race.items[0];
  const max = leader?.play_count || 1;
  const tone =
    race.tightness === "open"
      ? "border-amber-400/30 bg-amber-400/5"
      : race.tightness === "fight"
        ? "border-sky-400/25 bg-sky-400/5"
        : race.tightness === "runaway"
          ? "border-spotify-green/25 bg-spotify-green/5"
          : "border-white/[0.06] bg-white/[0.02]";

  return (
    <section className={cn("overflow-hidden rounded-2xl border", tone)}>
      <div className="flex items-end justify-between gap-3 px-4 pb-1 pt-4 sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {race.trophy}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            {race.title}
          </h2>
        </div>
        <span className="mb-0.5 shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/60">
          {race.tightness_label}
        </span>
      </div>

      {race.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-white/45 sm:px-5">
          {race.locked
            ? "No hubo suficientes repros este año."
            : "Todavía no hay suficientes repros este año."}
        </p>
      ) : (
        <ol className="space-y-1 px-2 pb-3 pt-2 sm:px-3">
          {race.items.slice(0, 5).map((item, i) => {
            const width = Math.max(4, (item.play_count / max) * 100);
            const inner = (
              <>
                <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-white/40">
                  {item.rank}
                </span>
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5 sm:h-11 sm:w-11">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Music2 className="h-4 w-4 text-white/30" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {item.name}
                  </span>
                  <span className="block truncate text-[11px] text-white/40">
                    {item.subtitle || gapLabel(leader!, item, race.locked)}
                    {item.subtitle
                      ? ` · ${gapLabel(leader!, item, race.locked)}`
                      : ""}
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        i === 0 ? "bg-spotify-green" : "bg-white/35",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold tabular-nums text-white">
                    {formatReproductionCount(item.play_count)}
                  </span>
                  <span className="block text-[10px] tabular-nums text-white/35">
                    {formatMs(item.ms_played)}
                  </span>
                </span>
              </>
            );

            const rowClass = cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 sm:gap-3",
              i === 0 && "bg-white/[0.04]",
              item.href && "transition hover:bg-white/[0.07]",
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={rowClass}>
                    {inner}
                  </Link>
                ) : (
                  <div className={rowClass}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
