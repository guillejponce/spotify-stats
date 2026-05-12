"use client";

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
import { formatReproductionCount, msToHours } from "@/lib/utils";
import type { MonthBucket } from "@/types/database";
import { CHILE_TIMEZONE_LABEL, formatChileMonthPeriod } from "@/lib/chile-time";

interface MonthRankChartProps {
  title: string;
  data: MonthBucket[];
  loading?: boolean;
}

export function MonthRankChart({
  title,
  data,
  loading = false,
}: MonthRankChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
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
          <div className="flex h-72 items-center justify-center">
            <p className="text-sm text-spotify-light-gray">Sin datos en este rango</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatted = data.map((d) => ({
      ...d,
      label: formatChileMonthPeriod(d.period),
      hours: msToHours(d.ms_played),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Meses con más reproducciones en el período filtrado (zona {CHILE_TIMEZONE_LABEL}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={288}>
          <BarChart data={formatted} margin={{ left: 4, right: 8, bottom: 56 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              angle={-40}
              textAnchor="end"
              height={72}
              interval={0}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#282828",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
              formatter={(count: number, _n, item) => {
                const row = item?.payload as MonthBucket & { hours?: number };
                const h = row?.hours ?? msToHours(row?.ms_played ?? 0);
                return [
                  `${formatReproductionCount(count)} reproducciones · ${h} h`,
                  "Segmentos",
                ];
              }}
              labelFormatter={(_l, payload) => {
                const row = payload?.[0]?.payload as { label?: string } | undefined;
                return row?.label ?? "";
              }}
            />
            <Bar dataKey="play_count" fill="#1DB954" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
