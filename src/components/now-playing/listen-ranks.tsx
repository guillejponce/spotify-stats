"use client";

import Link from "next/link";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import type { ListenRank } from "@/lib/listen-rank-types";

export function CompactListenRanks({
  track,
  artist,
}: {
  track: ListenRank | null;
  artist: ListenRank | null;
}) {
  if (!track && !artist) return null;
  return (
    <p className="mt-1 truncate text-[10px] leading-tight tabular-nums text-white/40 sm:text-[11px]">
      <RankInline kind="tema" rank={track} />
      <span className="mx-1.5 text-white/15" aria-hidden>
        ·
      </span>
      <RankInline kind="artista" rank={artist} />
    </p>
  );
}

function RankInline({
  kind,
  rank,
}: {
  kind: "tema" | "artista";
  rank: ListenRank | null;
}) {
  if (!rank || rank.plays <= 0) {
    return (
      <span>
        <span className="text-white/55">1ª vez</span> {kind}
      </span>
    );
  }
  return (
    <span>
      {rank.rank != null && (
        <>
          <span className="font-semibold text-white/70">
            #{formatReproductionCount(rank.rank)}
          </span>{" "}
        </>
      )}
      {kind}{" "}
      <span className="text-white/35">
        {formatReproductionCount(rank.plays)}
      </span>
    </span>
  );
}

export function FullListenRanks({
  track,
  artist,
  artistId,
  artistName,
}: {
  track: ListenRank | null;
  artist: ListenRank | null;
  artistId: string | null;
  artistName: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3.5 pb-3 sm:gap-3 sm:px-5">
      <RankTile kind="Canción" rank={track} />
      <RankTile
        kind="Artista"
        rank={artist}
        href={artistId ? `/artists/${artistId}` : undefined}
        subtitle={artistName}
      />
    </div>
  );
}

function RankTile({
  kind,
  rank,
  href,
  subtitle,
}: {
  kind: string;
  rank: ListenRank | null;
  href?: string;
  subtitle?: string;
}) {
  const inner = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        {kind}
      </p>
      {rank && rank.plays > 0 && rank.rank != null ? (
        <>
          <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight text-white sm:text-xl">
            #{formatReproductionCount(rank.rank)}
            {rank.among > 0 && (
              <span className="ml-1 text-xs font-medium text-white/35">
                de {formatReproductionCount(rank.among)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-white/50">
            {formatReproductionCount(rank.plays)} repros
            {rank.ms_played > 0 ? ` · ${formatMs(rank.ms_played)}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-white/70">Primera vez</p>
      )}
      {subtitle && (
        <p className="mt-0.5 truncate text-[11px] text-white/40">{subtitle}</p>
      )}
    </>
  );

  const className = cn(
    "rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2 sm:px-3",
    href && "transition hover:border-white/15 hover:bg-black/40",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}
