"use client";

import { Clock3, Flame, Disc3 } from "lucide-react";
import { CHILE_WEEKDAY_ROWS } from "@/lib/chile-time";
import { cn, formatReproductionCount, msToHours } from "@/lib/utils";
import type { HourlyData, ListeningTimeData } from "@/types/database";

function sunday0FromYmd(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function ListeningInsights({
  hourly,
  overTime,
  topArtist,
  onHour,
  onWeekday,
}: {
  hourly: HourlyData[];
  overTime: ListeningTimeData[];
  topArtist?: string;
  onHour?: (hour: number) => void;
  onWeekday?: (weekday: number) => void;
}) {
  const peakHour = hourly.reduce<HourlyData | null>(
    (best, row) => (!best || row.ms_played > best.ms_played ? row : best),
    null,
  );

  const weekdayAcc = CHILE_WEEKDAY_ROWS.map((label, weekday) => ({
    weekday,
    label,
    ms_played: 0,
    play_count: 0,
  }));
  for (const row of overTime) {
    const w = sunday0FromYmd(row.date);
    if (w == null) continue;
    weekdayAcc[w].ms_played += row.ms_played;
    weekdayAcc[w].play_count += row.play_count;
  }
  const peakDay = weekdayAcc.reduce(
    (best, row) => (row.ms_played > best.ms_played ? row : best),
    weekdayAcc[0],
  );

  const chips = [
    peakHour && peakHour.ms_played > 0
      ? {
          key: "hour",
          icon: Clock3,
          kicker: "Hora pico",
          value: `${String(peakHour.hour).padStart(2, "0")}:00`,
          hint: `${msToHours(peakHour.ms_played)} h`,
          onClick: () => onHour?.(peakHour.hour),
        }
      : null,
    peakDay && peakDay.ms_played > 0
      ? {
          key: "day",
          icon: Flame,
          kicker: "Día fuerte",
          value: peakDay.label,
          hint: `${formatReproductionCount(peakDay.play_count)} repros`,
          onClick: () => onWeekday?.(peakDay.weekday),
        }
      : null,
    topArtist
      ? {
          key: "artist",
          icon: Disc3,
          kicker: "Top artista",
          value: topArtist,
          hint: "en este período",
          onClick: undefined,
        }
      : null,
  ].filter(Boolean) as {
    key: string;
    icon: typeof Clock3;
    kicker: string;
    value: string;
    hint: string;
    onClick?: () => void;
  }[];

  if (chips.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {chips.map((chip) => {
        const Icon = chip.icon;
        const interactive = Boolean(chip.onClick);
        const Comp = interactive ? "button" : "div";
        return (
          <Comp
            key={chip.key}
            {...(interactive ? { type: "button" as const } : {})}
            onClick={chip.onClick}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-3 text-left sm:px-3.5",
              chip.key === "artist" && "col-span-2 lg:col-span-1",
              interactive &&
                "transition hover:border-spotify-green/30 hover:bg-white/[0.06] active:scale-[0.99]",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-spotify-green/15 text-spotify-green">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-spotify-light-gray/70">
                {chip.kicker}
              </span>
              <span className="block truncate text-sm font-semibold text-white">
                {chip.value}
              </span>
              <span className="block truncate text-[11px] text-spotify-light-gray/60">
                {chip.hint}
              </span>
            </span>
          </Comp>
        );
      })}
    </div>
  );
}
