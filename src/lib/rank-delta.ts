import { subDays } from "date-fns";
import { buildDateFilterChile } from "./chile-stats-range";
import type { TimeFilterParams } from "@/types/database";

/** Corte “hace 7 días” para comparar rankings dentro del mismo start. */
export function prevEndIso7d(endIso: string): string {
  const endMs = Date.parse(endIso);
  const base = Number.isFinite(endMs) ? new Date(endMs) : new Date();
  return subDays(base, 7).toISOString();
}

export function buildLeaderboardRangeWithPrev(params: TimeFilterParams): {
  start: string;
  end: string;
  prevEnd: string;
} {
  const { start, end } = buildDateFilterChile(params);
  return { start, end, prevEnd: prevEndIso7d(end) };
}

export function numeric(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function asRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export function mapRankFields(r: Record<string, unknown>): {
  rank?: number;
  prev_rank?: number | null;
  rank_delta?: number | null;
} {
  const out: {
    rank?: number;
    prev_rank?: number | null;
    rank_delta?: number | null;
  } = {};

  if (r.rank != null && r.rank !== "") {
    out.rank = numeric(r.rank);
  }

  const hasPrev = "prev_rank" in r;
  const hasDelta = "rank_delta" in r;

  if (hasPrev) {
    out.prev_rank =
      r.prev_rank == null || r.prev_rank === "" ? null : numeric(r.prev_rank);
  }
  if (hasDelta) {
    out.rank_delta =
      r.rank_delta == null || r.rank_delta === ""
        ? null
        : numeric(r.rank_delta);
  } else if (hasPrev && out.rank != null && out.prev_rank != null) {
    out.rank_delta = out.prev_rank - out.rank;
  }

  return out;
}

