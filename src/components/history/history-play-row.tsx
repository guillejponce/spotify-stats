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

function PlaybackMeta({ play }: { play: HistoryPlay }) {
  const bits: string[] = [];
  if (play.platform)
    bits.push(`Dispositivo: ${formatPlaybackPlatform(play.platform)}`);
  if (play.source)
    bits.push(`Origen: ${formatPlaybackSource(play.source)}`);
  if (play.reason_start)
    bits.push(`Inicio: ${play.reason_start}`);
  if (play.reason_end) bits.push(`Fin: ${play.reason_end}`);
  if (play.shuffle != null)
    bits.push(play.shuffle ? "Shuffle" : "Sin shuffle");
  if (play.offline != null)
    bits.push(play.offline ? "Offline" : "Online");

  if (bits.length === 0) return null;

  return (
    <p className="mt-1 text-[11px] leading-snug text-spotify-light-gray/65">
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
        "flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors duration-300 hover:bg-white/5",
        emphasizeTop &&
          "border-[#1DB954]/35 bg-[#1DB954]/[0.07] hover:bg-[#1DB954]/10",
      )}
    >
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
        {play.image_url ? (
          <Image
            src={play.image_url}
            alt={play.track_name}
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
          {play.track_name}
        </p>
        <p className="truncate text-xs text-spotify-light-gray">
          {play.artist_name}
          {play.album_name && ` · ${play.album_name}`}
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xs font-medium text-white/90">
          {formatChileDateTimeFromIso(play.played_at)}
        </p>
        <p className="text-[11px] text-spotify-light-gray/80">
          Escuchado {formatMs(play.ms_played)}
        </p>
        <PlaybackMeta play={play} />
      </div>
    </div>
  );
}
