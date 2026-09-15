"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ChartShell, ChartTip, chartAxis, chartGrid, useChartHeight } from "@/components/charts/chart-ui";
import { formatReproductionCount, msToHours } from "@/lib/utils";
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
  const height = useChartHeight(200, 268);
  const [picked, setPicked] = useState<string | null>(null);
  const formattedData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        hours: msToHours(d.ms_played),
        labelShort: formatChileCalendarDayShort(d.date),
        labelLong: formatChileCalendarDayLong(d.date),
      })),
    [data],
  );
  const selected = formattedData.find((d) => d.date === picked) ?? null;

  return (
    <ChartShell
      title={title}
      description={`Por día en ${CHILE_TIMEZONE_LABEL}. Toca un punto para fijar el detalle.`}
      loading={loading}
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={formattedData}
          margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
          onClick={(state) => {
            const row = state?.activePayload?.[0]?.payload as
              | (typeof formattedData)[number]
              | undefined;
            if (row?.date) setPicked(row.date);
          }}
        >
          <defs>
            <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1ED760" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#1DB954" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="labelShort" {...chartAxis} interval="preserveStartEnd" minTickGap={18} />
          <YAxis
            {...chartAxis}
            width={44}
            tickFormatter={(v) => `${msToHours(v)}h`}
          />
          <Tooltip
            cursor={{ stroke: "#1DB954", strokeWidth: 1, strokeOpacity: 0.35 }}
            content={
              <ChartTip
                title={(row) => String(row.labelLong ?? row.date ?? "")}
                body={(row) =>
                  `${msToHours(Number(row.ms_played))} h · ${formatReproductionCount(Number(row.play_count))} repros`
                }
              />
            }
          />
          <Area
            type="monotone"
            dataKey="ms_played"
            stroke="#1ED760"
            strokeWidth={2.25}
            fill="url(#colorPlays)"
            activeDot={{ r: 5, fill: "#fff", stroke: "#1DB954", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {selected && (
        <p className="mt-2 px-2 text-xs text-spotify-light-gray sm:px-0">
          <span className="font-medium text-white">{selected.labelLong}</span>
          {" · "}
          {msToHours(selected.ms_played)} h · {formatReproductionCount(selected.play_count)}{" "}
          reproducciones
        </p>
      )}
    </ChartShell>
  );
}
