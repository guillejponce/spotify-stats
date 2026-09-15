"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { TooltipProps } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const CHART_GREEN = "#1DB954";
export const CHART_GREEN_BRIGHT = "#1ED760";

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}

export function useChartHeight(mobile = 196, desktop = 268) {
  const isDesktop = useIsDesktop();
  return isDesktop ? desktop : mobile;
}

export function ChartSkeleton({ height = 196 }: { height?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-white/[0.03]"
      style={{ height }}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="absolute inset-x-3 bottom-3 flex h-[70%] items-end gap-1 sm:gap-1.5">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-spotify-green/15"
            style={{ height: `${28 + ((i * 41) % 62)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChartEmpty({ message = "Sin datos en este período" }: { message?: string }) {
  return (
    <div className="flex h-44 items-center justify-center sm:h-64">
      <p className="text-sm text-spotify-light-gray">{message}</p>
    </div>
  );
}

export function ChartShell({
  title,
  description,
  loading,
  empty,
  emptyMessage,
  children,
  className,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 scroll-mt-28 overflow-hidden border-white/[0.06] bg-spotify-dark-gray/80", className)}>
      <CardHeader className="space-y-1 p-4 sm:p-6">
        <CardTitle className="text-base tracking-tight sm:text-lg">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-relaxed sm:text-sm">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:px-6 sm:pb-6 sm:pt-0">
        {loading ? (
          <ChartSkeleton />
        ) : empty ? (
          <ChartEmpty message={emptyMessage} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

type TipRow = Record<string, unknown>;

export function ChartTip({
  active,
  payload,
  title,
  body,
}: TooltipProps<number, string> & {
  title: (row: TipRow) => string;
  body: (row: TipRow) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload as TipRow;
  return (
    <div className="rounded-xl border border-white/10 bg-[#141414]/95 px-3 py-2 shadow-2xl backdrop-blur-md">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">
        {title(row)}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{body(row)}</p>
    </div>
  );
}

export const chartAxis = {
  stroke: "rgba(255,255,255,0.28)",
  fontSize: 11,
  tickLine: false as const,
  axisLine: false as const,
};

export const chartGrid = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.05)",
  vertical: false,
};
