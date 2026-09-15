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
import type { MonthBucket } from "@/types/database";
import { CHILE_TIMEZONE_LABEL } from "@/lib/chile-time";

const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function monthIndex(period: string): number {
  const num = Number(period);
  return num >= 1 && num <= 12 ? num - 1 : -1;
}

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
  const height = useChartHeight(210, 268);
  const [picked, setPicked] = useState<string | null>(null);
  const formatted = useMemo(
    () =>
      data.map((d) => {
        const idx = monthIndex(d.period);
        return {
          ...d,
          label: idx >= 0 ? MONTH_SHORT[idx] : d.period,
          fullLabel: idx >= 0 ? MONTH_NAMES[idx] : d.period,
          hours: msToHours(d.ms_played),
        };
      }),
    [data],
  );
  const peak = formatted.reduce(
    (best, row) => (row.play_count > best.play_count ? row : best),
    formatted[0] ?? { period: "", play_count: 0, ms_played: 0, label: "", fullLabel: "", hours: 0 },
  );
  const selected = formatted.find((d) => d.period === picked) ?? (peak.play_count > 0 ? peak : null);

  return (
    <ChartShell
      title={title}
      description={`Por mes del año (todos los años, ${CHILE_TIMEZONE_LABEL}).`}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Sin datos en este rango"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={formatted} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} interval={0} />
          <YAxis {...chartAxis} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(29,185,84,0.08)" }}
            content={
              <ChartTip
                title={(row) => String(row.fullLabel ?? row.label ?? "")}
                body={(row) =>
                  `${formatReproductionCount(Number(row.play_count))} repros · ${msToHours(Number(row.ms_played))} h`
                }
              />
            }
          />
          <Bar
            dataKey="play_count"
            radius={[5, 5, 0, 0]}
            maxBarSize={36}
            onClick={(row) => {
              const period = String((row as MonthBucket).period ?? "");
              if (period) setPicked(period);
            }}
          >
            {formatted.map((entry) => (
              <Cell
                key={entry.period}
                cursor="pointer"
                fill={entry.period === peak.period ? CHART_GREEN_BRIGHT : CHART_GREEN}
                opacity={picked == null || picked === entry.period ? 1 : 0.28}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <p className="mt-2 px-2 text-xs text-spotify-light-gray sm:px-0">
          <span className="font-medium text-white">{selected.fullLabel}</span>
          {" · "}
          {formatReproductionCount(selected.play_count)} reproducciones · {selected.hours} h
        </p>
      )}
    </ChartShell>
  );
}
