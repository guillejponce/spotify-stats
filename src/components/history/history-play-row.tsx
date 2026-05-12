"use client";

import Image from "next/image";
import { Music2 } from "lucide-react";
import { formatMs, cn } from "@/lib/utils";
import { formatChileDateTimeFromIso } from "@/lib/chile-time";
import {
  formatPlaybackPlatform,
  formatPlaybackSource,
} from "@/lib/playback-platform";
import type { HistoryPlay } from "@/types/history";

function PlaybackMeta({
  play,
  className,
}: {
  play: HistoryPlay;
  className?: string;
}) {
  const bits: string[] = [];
  if (play.platform)
    bits.push(`Dispositivo: ${formatPlaybackPlatform(play.platform)}`);
  if (play.source) bits.push(`Origen: ${formatPlaybackSource(play.source)}`);
  if (play.reason_start) bits.push(`Inicio: ${play.reason_start}`);
  if (play.reason_end) bits.push(`Fin: ${play.reason_end}`);
  if (play.shuffle != null)
    bits.push(play.shuffle ? "Shuffle" : "Sin shuffle");
  if (play.offline != null) bits.push(play.offline ? "Offline" : "Online");

  if (bits.length === 0) return null;

  return (
    <p
      className={cn(
        "text-[11px] leading-snug text-spotify-light-gray/65",
        className,
      )}
    >
      {bits.join(" · ")}
    </p>
  );
}

export function HistoryPlayRow({
  play,
  emphasizeTop,
}: {
  play: HistoryPlay;
  emphasizeTop?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-transparent p-3 transition-colors duration-300 hover:bg-white/5 sm:rounded-lg sm:p-2",
        emphasizeTop &&
          "border-[#1DB954]/35 bg-[#1DB954]/[0.07] hover:bg-[#1DB954]/10",
      )}
    >
      <div className="flex gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md sm:h-10 sm:w-10">
          {play.image_url ? (
            <Image
              src={play.image_url}
              alt={play.track_name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-spotify-medium-gray">
              <Music2 className="h-5 w-5 text-spotify-light-gray sm:h-4 sm:w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white sm:truncate sm:leading-normal">
            {play.track_name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-spotify-light-gray sm:truncate">
            {play.artist_name}
            {play.album_name && ` · ${play.album_name}`}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end justify-center gap-0.5 text-right sm:flex">
          <p className="text-xs font-medium tabular-nums text-white/90">
            {formatChileDateTimeFromIso(play.played_at)}
          </p>
          <p className="text-[11px] tabular-nums text-spotify-light-gray/80">
            Escuchado {formatMs(play.ms_played)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.04] pt-2 text-xs tabular-nums sm:hidden">
        <span className="font-medium text-white/90">
          {formatChileDateTimeFromIso(play.played_at)}
        </span>
        <span className="text-spotify-light-gray/85">
          {formatMs(play.ms_played)}
        </span>
      </div>
      <PlaybackMeta
        play={play}
        className="mt-2 pl-[calc(3rem+0.75rem)] sm:mt-1.5 sm:pl-[calc(2.5rem+0.75rem)]"
      />
    </div>
  );
}
