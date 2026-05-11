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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { msToHours } from "@/lib/utils";
import type { HourlyData } from "@/types/database";

interface HourlyChartProps {
  title: string;
  data: HourlyData[];
  loading?: boolean;
}

export function HourlyChart({ title, data, loading = false }: HourlyChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
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
    label: `${d.hour.toString().padStart(2, "0")}:00`,
    hours: msToHours(d.ms_played),
  }));

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.3)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={2}
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
              }}
              formatter={(value: number) => [`${msToHours(value)}h`, "Listening"]}
            />
            <Bar dataKey="ms_played" fill="#1DB954" radius={[4, 4, 0, 0]} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
