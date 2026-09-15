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
import type { YearBucket } from "@/types/database";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";

interface YearBarChartProps {
  title: string;
  data: YearBucket[];
  loading?: boolean;
}

export function YearBarChart({ title, data, loading = false }: YearBarChartProps) {
  const height = useChartHeight(210, 268);
  const [picked, setPicked] = useState<number | null>(null);
  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: String(d.year),
        hours: msToHours(d.ms_played),
      })),
    [data],
  );
  const peak = formatted.reduce(
    (best, row) => (row.play_count > best.play_count ? row : best),
    formatted[0] ?? { year: 0, play_count: 0, ms_played: 0, label: "", hours: 0 },
  );
  const selected = formatted.find((d) => d.year === picked) ?? (peak.play_count > 0 ? peak : null);

  return (
    <ChartShell
      title={title}
      description={`Total por año civil en ${CHILE_TIMEZONE_LABEL}.`}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Sin datos en este rango"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={formatted} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} />
          <YAxis {...chartAxis} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(29,185,84,0.08)" }}
            content={
              <ChartTip
                title={(row) => `Año ${String(row.year ?? "")}`}
                body={(row) =>
                  `${formatReproductionCount(Number(row.play_count))} repros · ${msToHours(Number(row.ms_played))} h`
                }
              />
            }
          />
          <Bar
            dataKey="play_count"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
            onClick={(row) => {
              const year = Number((row as YearBucket).year);
              if (Number.isFinite(year)) setPicked(year);
            }}
          >
            {formatted.map((entry) => (
              <Cell
                key={entry.year}
                cursor="pointer"
                fill={entry.year === peak.year ? CHART_GREEN_BRIGHT : CHART_GREEN}
                opacity={picked == null || picked === entry.year ? 1 : 0.28}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <p className="mt-2 px-2 text-xs text-spotify-light-gray sm:px-0">
          <span className="font-medium text-white">{selected.year}</span>
          {" · "}
          {formatReproductionCount(selected.play_count)} reproducciones · {selected.hours} h
        </p>
      )}
    </ChartShell>
  );
}
