"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  if (ratio < 0.25) return "bg-spotify-green/20";
  if (ratio < 0.5) return "bg-spotify-green/40";
  if (ratio < 0.75) return "bg-spotify-green/60";
  return "bg-spotify-green";
}

export function Heatmap({ title, data, loading = false, year }: HeatmapProps) {
  const { rows, max } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d]));
    const maxCount = Math.max(...data.map((d) => d.count), 1);

    const startPadding = utcWeekdayJan1(year);
    const days = Array.from(eachYmdInGregorianYear(year));

    const weeks: { date: string; count: number; ms_played: number }[][] = [];
    let current: { date: string; count: number; ms_played: number }[] = [];

    for (let i = 0; i < startPadding; i++) {
      current.push({ date: "", count: -1, ms_played: 0 });
    }

    for (const dateStr of days) {
      const entry = map.get(dateStr);
      current.push({
        date: dateStr,
        count: entry?.count ?? 0,
        ms_played: entry?.ms_played ?? 0,
      });

      const [, m, d] = dateStr.split("-").map(Number);
      const dow = new Date(Date.UTC(year, m - 1, d, 12, 0, 0)).getUTCDay();
      const last =
        m === 12 && d === 31;

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
    const matrix: ({
      date: string;
      count: number;
      ms_played: number;
    } | null)[][] = Array.from({ length: 7 }, (_, ri) =>
      Array.from({ length: numWeeks }, (_, wi) => padded[wi][ri] ?? null)
    );

    return { rows: matrix, max: maxCount };
  }, [data, year]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-36 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Eje vertical = día de la semana · horizontal = semanas del año · cada cuadrado = un día
          en {CHILE_TIMEZONE_LABEL}. Pasá el mouse para ver fecha, reproducciones y tiempo escuchado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-1">
          <div className="flex flex-col gap-[3px]">
            {rows.map((row, ri) => (
              <div key={ri} className="flex items-center gap-1">
                <span
                  className="w-8 shrink-0 text-right text-[10px] font-medium text-spotify-light-gray/70"
                  title="Día de la semana (Chile)"
                >
                  {CHILE_WEEKDAY_ROWS[ri]}
                </span>
                <div className="flex gap-[3px]">
                  {row.map((cell, ci) => {
                    if (!cell || cell.count < 0 || !cell.date) {
                      return (
                        <div
                          key={ci}
                          className="h-3 w-3 shrink-0 rounded-sm bg-transparent"
                        />
                      );
                    }
                    const label = formatChileCalendarDayLong(cell.date);
                    const title = `${label}\n${formatReproductionCount(cell.count)} reproducciones · ${formatMs(cell.ms_played)}`;
                    return (
                      <div
                        key={ci}
                        className={cn(
                          "h-3 w-3 shrink-0 rounded-sm transition-colors",
                          getIntensityClass(cell.count, max)
                        )}
                        title={title}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-spotify-light-gray/50">
            Eje horizontal: semanas de enero a diciembre · colores = intensidad de escuchas
            ese día (Chile).
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-1 text-[10px] text-spotify-light-gray/60">
            <span>Menos</span>
            <div className="h-3 w-3 rounded-sm bg-white/5" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/20" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/40" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/60" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green" />
            <span>Más</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
