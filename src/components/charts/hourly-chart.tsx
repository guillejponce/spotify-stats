"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  CHART_GREEN,
  CHART_GREEN_BRIGHT,
  ChartShell,
  ChartTip,
  chartAxis,
  chartGrid,
  useChartHeight,
} from "@/components/charts/chart-ui";
import { formatReproductionCount, msToHours } from "@/lib/utils";
import type { HourlyData } from "@/types/database";
import {
  CHILE_TIMEZONE_LABEL,
  formatChileHourSlotLabel,
} from "@/lib/chile-time";

interface HourlyChartProps {
  title: string;
  data: HourlyData[];
  loading?: boolean;
  highlightHour?: number | null;
}

export function HourlyChart({
  title,
  data,
  loading = false,
  highlightHour = null,
}: HourlyChartProps) {
  const height = useChartHeight(200, 268);
  const [picked, setPicked] = useState<number | null>(null);
  const formattedData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        slotLabel: formatChileHourSlotLabel(d.hour),
        axisTick: `${d.hour.toString().padStart(2, "0")}`,
        hours: msToHours(d.ms_played),
      })),
    [data],
  );
  const peak = formattedData.reduce(
    (best, row) => (row.ms_played > best.ms_played ? row : best),
    formattedData[0] ?? { hour: -1, ms_played: 0, play_count: 0, slotLabel: "", axisTick: "", hours: 0 },
  );
  const activeHour = picked ?? highlightHour;
  const selected =
    formattedData.find((d) => d.hour === activeHour) ??
    (peak.ms_played > 0 ? peak : null);

  return (
    <ChartShell
      title={title}
      description={`Hora de inicio en ${CHILE_TIMEZONE_LABEL}. Toca una barra.`}
      loading={loading}
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={formattedData}
          margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="hourlyBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_GREEN_BRIGHT} />
              <stop offset="100%" stopColor={CHART_GREEN} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="axisTick" {...chartAxis} fontSize={10} interval={2} />
          <YAxis
            {...chartAxis}
            width={44}
            tickFormatter={(v) => `${msToHours(v)}h`}
          />
          <Tooltip
            cursor={{ fill: "rgba(29,185,84,0.08)" }}
            content={
              <ChartTip
                title={(row) => `Franja ${String(row.slotLabel ?? "")}`}
                body={(row) =>
                  `${msToHours(Number(row.ms_played))} h · ${formatReproductionCount(Number(row.play_count))} repros`
                }
              />
            }
          />
          <Bar
            dataKey="ms_played"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            onClick={(row) => {
              const hour = Number((row as HourlyData).hour);
              if (Number.isFinite(hour)) setPicked(hour);
            }}
          >
            {formattedData.map((entry) => {
              const isActive = activeHour == null || entry.hour === activeHour;
              const isPeak = entry.hour === peak.hour;
              return (
                <Cell
                  key={entry.hour}
                  cursor="pointer"
                  fill={isPeak ? CHART_GREEN_BRIGHT : "url(#hourlyBar)"}
                  opacity={isActive ? 1 : 0.28}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && selected.ms_played > 0 && (
        <p className="mt-2 px-2 text-xs text-spotify-light-gray sm:px-0">
          <span className="font-medium text-white">{selected.slotLabel}</span>
          {" · "}
          {selected.hours} h · {formatReproductionCount(selected.play_count)} reproducciones
        </p>
      )}
    </ChartShell>
  );
}
