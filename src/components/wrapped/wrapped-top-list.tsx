"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Music2, Search } from "lucide-react";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import type { WrappedRacer } from "@/types/wrapped";

export function WrappedTopList({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: WrappedRacer[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.name} ${item.subtitle ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-white/40">{hint}</p>
        </div>
        <label className="relative block w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar…"
            className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-spotify-green/50"
          />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/45 sm:px-5">
          No hay ranking para este año.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/45 sm:px-5">
          Nada coincide con “{query.trim()}”.
        </p>
      ) : (
        <ol className="max-h-[min(40rem,75vh)] space-y-0.5 overflow-y-auto px-2 py-2 sm:px-3">
          {filtered.map((item, i) => {
            const inner = (
              <>
                <span className="w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-white/35">
                  {item.rank}
                </span>
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/5">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="36px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Music2 className="h-3.5 w-3.5 text-white/30" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {item.name}
                  </span>
                  {item.subtitle && (
                    <span className="block truncate text-[11px] text-white/40">
                      {item.subtitle}
                    </span>
                  )}
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
              "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
              i === 0 && !query && "bg-white/[0.04]",
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
