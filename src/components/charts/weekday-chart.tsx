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
  highlightWeekday?: number | null;
}

export function WeekdayChart({
  title,
  data,
  loading = false,
  highlightWeekday = null,
}: WeekdayChartProps) {
  const height = useChartHeight(200, 248);
  const [picked, setPicked] = useState<number | null>(null);
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

  const peak = rows.reduce(
    (best, row) => (row.ms_played > best.ms_played ? row : best),
    rows[0] ?? { weekday: -1, label: "", ms_played: 0, play_count: 0 },
  );
  const active = picked ?? highlightWeekday;
  const selected = rows.find((d) => d.weekday === active) ?? (peak.ms_played > 0 ? peak : null);

  return (
    <ChartShell
      title={title}
      description={`Suma por día de la semana en ${CHILE_TIMEZONE_LABEL}.`}
      loading={loading}
      empty={rows.length === 0}
      className="min-w-0"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} />
          <YAxis
            {...chartAxis}
            width={44}
            tickFormatter={(v) => `${msToHours(v)}h`}
          />
          <Tooltip
            cursor={{ fill: "rgba(29,185,84,0.08)" }}
            content={
              <ChartTip
                title={(row) => String(row.label ?? "")}
                body={(row) =>
                  `${msToHours(Number(row.ms_played))} h · ${formatReproductionCount(Number(row.play_count))} repros`
                }
              />
            }
          />
          <Bar
            dataKey="ms_played"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
            onClick={(row) => {
              const w = Number((row as { weekday?: number }).weekday);
              if (Number.isFinite(w)) setPicked(w);
            }}
          >
            {rows.map((entry) => {
              const isActive = active == null || entry.weekday === active;
              return (
                <Cell
                  key={entry.weekday}
                  cursor="pointer"
                  fill={entry.weekday === peak.weekday ? CHART_GREEN_BRIGHT : CHART_GREEN}
                  opacity={isActive ? 1 : 0.28}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <p className="mt-2 px-2 text-xs text-spotify-light-gray sm:px-0">
          <span className="font-medium text-white">{selected.label}</span>
          {" · "}
          {msToHours(selected.ms_played)} h · {formatReproductionCount(selected.play_count)}{" "}
          reproducciones
        </p>
      )}
    </ChartShell>
  );
}
