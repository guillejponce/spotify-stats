"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  title: string;
  data: { date: string; count: number; ms_played: number }[];
  loading?: boolean;
  year: number;
}

function getIntensityClass(count: number, max: number): string {
  if (count === 0) return "bg-white/5";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-spotify-green/20";
  if (ratio < 0.5) return "bg-spotify-green/40";
  if (ratio < 0.75) return "bg-spotify-green/60";
  return "bg-spotify-green";
}

export function Heatmap({ title, data, loading = false, year }: HeatmapProps) {
  const { grid, max } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d]));
    const max = Math.max(...data.map((d) => d.count), 1);

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const weeks: { date: string; count: number }[][] = [];
    let currentWeek: { date: string; count: number }[] = [];

    const startPadding = startDate.getDay();
    for (let i = 0; i < startPadding; i++) {
      currentWeek.push({ date: "", count: -1 });
    }

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split("T")[0];
      const entry = map.get(dateStr);
      currentWeek.push({
        date: dateStr,
        count: entry?.count || 0,
      });

      if (d.getDay() === 6 || d.getTime() === endDate.getTime()) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    return { grid: weeks, max };
  }, [data, year]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px]">
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => (
                  <div
                    key={`${wi}-${di}`}
                    className={cn(
                      "h-3 w-3 rounded-sm transition-colors",
                      day.count === -1
                        ? "bg-transparent"
                        : getIntensityClass(day.count, max)
                    )}
                    title={
                      day.date ? `${day.date}: ${day.count} plays` : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-spotify-light-gray/60">
            <span>Less</span>
            <div className="h-3 w-3 rounded-sm bg-white/5" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/20" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/40" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green/60" />
            <div className="h-3 w-3 rounded-sm bg-spotify-green" />
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
