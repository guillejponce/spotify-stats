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
import { formatNumber, msToHours } from "@/lib/utils";
import type { YearBucket } from "@/types/database";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";

interface YearBarChartProps {
  title: string;
  data: YearBucket[];
  loading?: boolean;
}

export function YearBarChart({ title, data, loading = false }: YearBarChartProps) {
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
    label: String(d.year),
    hours: msToHours(d.ms_played),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Total por año civil en {CHILE_TIMEZONE_LABEL}; altura = filas (segmentos) en cada año.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={288}>
          <BarChart data={formatted} margin={{ left: 4, right: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
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
                const row = item?.payload as YearBucket & { hours?: number };
                const h = row?.hours ?? msToHours(row?.ms_played ?? 0);
                return [
                  `${formatNumber(count)} reproducciones · ${h} h`,
                  "Segmentos",
                ];
              }}
              labelFormatter={(y) => `Año ${y}`}
            />
            <Bar dataKey="play_count" fill="#169c46" radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
