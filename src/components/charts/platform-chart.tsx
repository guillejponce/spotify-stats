"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { msToHours, formatNumber } from "@/lib/utils";
import { summarizePlatformsForChart } from "@/lib/playback-platform";

const COLORS = ["#1DB954", "#1AA34A", "#15803D", "#166534", "#14532D", "#4ADE80", "#86EFAC"];

interface PlatformChartProps {
  title: string;
  data: { platform: string; play_count: number; ms_played: number }[];
  loading?: boolean;
}

export function PlatformChart({ title, data, loading = false }: PlatformChartProps) {
  const chartData = useMemo(() => summarizePlatformsForChart(data), [data]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><Skeleton className="mx-auto h-64 w-64 rounded-full" /></CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Cómo te escuchabas la música cuando el dato existe: en imports completos aparece el
          dispositivo real; desde la API de Spotify solo sabemos que fue sincronizada como «últimas
          reproducciones», no el equipo concreto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="play_count"
              nameKey="platform"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#282828",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string, props) => {
                const ms =
                  typeof props?.payload === "object" &&
                  props.payload !== null &&
                  "ms_played" in props.payload
                    ? Number(
                        (props.payload as { ms_played: number }).ms_played
                      )
                    : 0;
                return [
                  `${formatNumber(Number(value))} reproducciones · ${msToHours(ms)} h`,
                  name,
                ];
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "#B3B3B3" }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
