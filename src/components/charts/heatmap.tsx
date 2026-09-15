"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartSkeleton } from "@/components/charts/chart-ui";
import { cn, formatMs, formatReproductionCount } from "@/lib/utils";
import {
  CHILE_TIMEZONE_LABEL,
  CHILE_WEEKDAY_ROWS,
  eachYmdInGregorianYear,
  formatChileCalendarDayLong,
  utcWeekdayJan1,
} from "@/lib/chile-time";

interface HeatmapProps {
  title: string;
  data: { date: string; count: number; ms_played: number }[];
  loading?: boolean;
  year: number;
}

type Cell = { date: string; count: number; ms_played: number } | null;

function padWeek(
  week: { date: string; count: number; ms_played: number }[]
): ({ date: string; count: number; ms_played: number } | null)[] {
  const w = week.map((d) => ({ ...d }));
  while (w.length < 7) {
    w.push({ date: "", count: -1, ms_played: 0 });
  }
  return w;
}

function getIntensityClass(count: number, max: number): string {
  if (count <= 0) return "bg-white/5";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-spotify-green/25";
  if (ratio < 0.5) return "bg-spotify-green/45";
  if (ratio < 0.75) return "bg-spotify-green/70";
  return "bg-spotify-green";
}

export function Heatmap({ title, data, loading = false, year }: HeatmapProps) {
  const { rows, max, latestWithPlays } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d]));
    const maxCount = Math.max(...data.map((d) => d.count), 1);

    const startPadding = utcWeekdayJan1(year);
    const days = Array.from(eachYmdInGregorianYear(year));

    const weeks: { date: string; count: number; ms_played: number }[][] = [];
    let current: { date: string; count: number; ms_played: number }[] = [];
    let latest: { date: string; count: number; ms_played: number } | null = null;

    for (let i = 0; i < startPadding; i++) {
      current.push({ date: "", count: -1, ms_played: 0 });
    }

    for (const dateStr of days) {
      const entry = map.get(dateStr);
      const cell = {
        date: dateStr,
        count: entry?.count ?? 0,
        ms_played: entry?.ms_played ?? 0,
      };
      if (cell.count > 0) latest = cell;
      current.push(cell);

      const [, m, d] = dateStr.split("-").map(Number);
      const dow = new Date(Date.UTC(year, m - 1, d, 12, 0, 0)).getUTCDay();
      const last = m === 12 && d === 31;

      if (dow === 6 || last) {
        weeks.push(current);
        current = [];
      }
    }

    if (current.length) {
      weeks.push(current);
    }

    const padded = weeks.map(padWeek);
    const numWeeks = padded.length;
    const matrix: Cell[][] = Array.from({ length: 7 }, (_, ri) =>
      Array.from({ length: numWeeks }, (_, wi) => padded[wi][ri] ?? null)
    );

    return { rows: matrix, max: maxCount, latestWithPlays: latest };
  }, [data, year]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    setSelectedDate(null);
  }, [year]);
  const selectedCell = useMemo(() => {
    const want = selectedDate ?? latestWithPlays?.date ?? null;
    if (!want) return null;
    for (const row of rows) {
      for (const cell of row) {
        if (cell && cell.date === want) return cell;
      }
    }
    return latestWithPlays;
  }, [rows, selectedDate, latestWithPlays]);

  if (loading) {
    return (
      <Card className="min-w-0 overflow-hidden border-white/[0.06]">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 sm:pt-0">
          <ChartSkeleton height={140} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden border-white/[0.06]">
      <CardHeader className="space-y-1 p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Cada cuadrado es un día en {CHILE_TIMEZONE_LABEL}. Toca uno para ver el detalle.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
          <div className="flex min-w-max flex-col gap-[3px] px-1">
            {rows.map((row, ri) => (
              <div key={ri} className="flex items-center gap-1">
                <span className="w-7 shrink-0 text-right text-[10px] font-medium text-spotify-light-gray/70 sm:w-8">
                  {CHILE_WEEKDAY_ROWS[ri]}
                </span>
                <div className="flex gap-[3px]">
                  {row.map((cell, ci) => {
                    if (!cell || cell.count < 0 || !cell.date) {
                      return (
                        <div
                          key={ci}
                          className="h-3.5 w-3.5 shrink-0 rounded-[3px] bg-transparent sm:h-3 sm:w-3"
                        />
                      );
                    }
                    const isSelected = selectedCell?.date === cell.date;
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => setSelectedDate(cell.date)}
                        aria-label={formatChileCalendarDayLong(cell.date)}
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 rounded-[3px] transition sm:h-3 sm:w-3",
                          getIntensityClass(cell.count, max),
                          isSelected && "ring-2 ring-white ring-offset-1 ring-offset-spotify-dark-gray",
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedCell && selectedCell.date && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <p className="text-sm font-medium text-white">
              {formatChileCalendarDayLong(selectedCell.date)}
            </p>
            <p className="mt-0.5 text-xs text-spotify-light-gray">
              {selectedCell.count > 0
                ? `${formatReproductionCount(selectedCell.count)} reproducciones · ${formatMs(selectedCell.ms_played)}`
                : "Sin escuchas ese día"}
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-end gap-1 text-[10px] text-spotify-light-gray/60">
          <span>Menos</span>
          <div className="h-3 w-3 rounded-sm bg-white/5" />
          <div className="h-3 w-3 rounded-sm bg-spotify-green/25" />
          <div className="h-3 w-3 rounded-sm bg-spotify-green/45" />
          <div className="h-3 w-3 rounded-sm bg-spotify-green/70" />
          <div className="h-3 w-3 rounded-sm bg-spotify-green" />
          <span>Más</span>
        </div>
      </CardContent>
    </Card>
  );
}
