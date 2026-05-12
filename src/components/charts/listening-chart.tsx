"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import {
  CHILE_TIMEZONE_LABEL,
  formatChileCalendarDayLong,
  formatChileCalendarDayShort,
} from "@/lib/chile-time";

interface ListeningChartProps {
  title: string;
  data: ListeningTimeData[];
  loading?: boolean;
}

export function ListeningChart({
  title,
  data,
  loading = false,
}: ListeningChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
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

  const formattedData = data.map((d) => ({
    ...d,
    hours: msToHours(d.ms_played),
    labelShort: formatChileCalendarDayShort(d.date),
    labelLong: formatChileCalendarDayLong(d.date),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Agrupación por día (o semana/mes según período) en {CHILE_TIMEZONE_LABEL}.
          Cada barra suma reproducciones registradas (segmentos de escucha), igual que el KPI
          principal del dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1DB954" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1DB954" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="labelShort"
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
                const row = item?.payload as ListeningTimeData | undefined;
                const plays = row?.play_count ?? 0;
                return [
                  `${msToHours(value)} h · ${formatReproductionCount(plays)} reproducciones`,
                  "Tiempo escuchado",
                ];
              }}
              labelFormatter={(_label, payload) => {
                const row = payload?.[0]?.payload as
                  | { labelLong?: string; date?: string }
                  | undefined;
                return row?.labelLong ?? row?.date ?? "";
              }}
            />
            <Area
              type="monotone"
              dataKey="ms_played"
              stroke="#1DB954"
              strokeWidth={2}
              fill="url(#colorPlays)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
