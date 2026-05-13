"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { msToHours, formatReproductionCount } from "@/lib/utils";
import type { ListeningTimeData } from "@/types/database";
import { CHILE_TIMEZONE_LABEL, CHILE_WEEKDAY_ROWS } from "@/lib/chile-time";

function sunday0FromYmd(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

interface WeekdayChartProps {
  title: string;
  data: ListeningTimeData[];
  loading?: boolean;
}

export function WeekdayChart({ title, data, loading = false }: WeekdayChartProps) {
  const rows = useMemo(() => {
    const acc = CHILE_WEEKDAY_ROWS.map((label, weekday) => ({
      weekday,
      label,
      ms_played: 0,
      play_count: 0,
    }));
    for (const row of data) {
      const w = sunday0FromYmd(row.date);
      if (w == null) continue;
      acc[w].ms_played += row.ms_played;
      acc[w].play_count += row.play_count;
    }
    const nonzero = acc.filter((x) => x.ms_played > 0);
    return nonzero.length ? nonzero : [];
  }, [data]);

  if (loading) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-spotify-light-gray">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Suma de cada día civil en el período ({CHILE_TIMEZONE_LABEL}), usando el día de la
          semana de esa fecha calendario.
        </CardDescription>
      </CardHeader>
      <CardContent className="-mx-1 px-1 sm:mx-0 sm:px-0">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${msToHours(v)}h`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#282828",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
                maxWidth: 280,
              }}
              formatter={(value: number, _name, item) => {
                const row = item?.payload as typeof rows[number] | undefined;
                const plays = row?.play_count ?? 0;
                return [
                  `${msToHours(value)} h · ${formatReproductionCount(plays)} repros`,
                  "Tiempo escuchado",
                ];
              }}
            />
            <Bar
              dataKey="ms_played"
              fill="#1ED760"
              radius={[4, 4, 0, 0]}
              opacity={0.85}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
