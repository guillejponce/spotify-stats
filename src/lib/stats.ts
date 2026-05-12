import { createServerSupabaseClient } from "./supabase";
import { buildDateFilterChile } from "./chile-stats-range";
import type {
  TopItem,
  ListeningTimeData,
  HourlyData,
  TimeFilterParams,
  MonthBucket,
  YearBucket,
} from "@/types/database";

/** Payload listo para serializar en `/api/stats` (sin heatmap). */
export interface DashboardBundlePayload {
  totalMs: number;
  playCount: number;
  sessionCount: number;
  topTracks: TopItem[];
  topArtists: TopItem[];
  topAlbums: TopItem[];
  listeningOverTime: ListeningTimeData[];
  hourlyData: HourlyData[];
  monthsTop: MonthBucket[];
  yearsBreakdown: YearBucket[];
}

function numeric(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function firstRpcRow<R extends Record<string, unknown>>(
  data: unknown,
  fallback: R
): R {
  if (data == null) return fallback;
  if (Array.isArray(data))
    return (data[0] as R | undefined) ?? fallback;
  if (typeof data === "object") return data as R;
  return fallback;
}

function asRpcRows<T>(data: unknown): T[] {
  if (data == null) return [];
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapTopItemRow(r: Record<string, unknown>): TopItem {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    image_url:
      r.image_url == null ? null : String(r.image_url as string),
    play_count: numeric(r.play_count),
    total_ms_played: numeric(r.total_ms_played),
  };
}

/** PostgREST a veces devuelve jsonb como string; en otros casos como objeto o fila única. */
function normalizeDashboardRpcPayload(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  if (typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  if (
    Array.isArray(data) &&
    data.length === 1 &&
    data[0] != null &&
    typeof data[0] === "object" &&
    !Array.isArray(data[0])
  ) {
    return data[0] as Record<string, unknown>;
  }

  return null;
}

function rollupMonthsTopFromDays(days: ListeningTimeData[]): MonthBucket[] {
  const map = new Map<string, { ms: number; count: number }>();
  for (const d of days) {
    if (!d.date || d.date.length < 7) continue;
    const period = d.date.slice(0, 7);
    const prev = map.get(period) ?? { ms: 0, count: 0 };
    prev.ms += d.ms_played;
    prev.count += d.play_count;
    map.set(period, prev);
  }
  return Array.from(map.entries())
    .map(([period, v]) => ({
      period,
      ms_played: v.ms,
      play_count: v.count,
    }))
    .sort((a, b) => b.play_count - a.play_count)
    .slice(0, 36);
}

function rollupYearsFromDays(days: ListeningTimeData[]): YearBucket[] {
  const map = new Map<number, { ms: number; count: number }>();
  for (const d of days) {
    if (!d.date || d.date.length < 4) continue;
    const y = Number(d.date.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    const prev = map.get(y) ?? { ms: 0, count: 0 };
    prev.ms += d.ms_played;
    prev.count += d.play_count;
    map.set(y, prev);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({
      year,
      ms_played: v.ms,
      play_count: v.count,
    }));
}

async function getDashboardLegacyPayload(
  params: TimeFilterParams,
  limit: number,
): Promise<DashboardBundlePayload> {
  const [
    totalListening,
    topTracks,
    topArtists,
    topAlbums,
    listeningOverTime,
    hourlyData,
  ] = await Promise.all([
    getTotalListeningTime(params),
    getTopTracks(params, limit),
    getTopArtists(params, limit),
    getTopAlbums(params, limit),
    getListeningOverTime(params, "day"),
    getHourlyDistribution(params),
  ]);

  return {
    totalMs: totalListening.total_ms,
    playCount: totalListening.play_count,
    sessionCount: totalListening.session_count,
    topTracks,
    topArtists,
    topAlbums,
    listeningOverTime,
    hourlyData,
    monthsTop: rollupMonthsTopFromDays(listeningOverTime),
    yearsBreakdown: rollupYearsFromDays(listeningOverTime),
  };
}

function parseDashboardBundleJson(root: Record<string, unknown>): DashboardBundlePayload {
  const totalRaw =
    root.total && typeof root.total === "object"
      ? (root.total as Record<string, unknown>)
      : {};

  const listeningRows = asRpcRows<Record<string, unknown>>(
    root.listening_by_day,
  ).map((r) => ({
    date: String(r.date ?? ""),
    ms_played: numeric(r.ms_played),
    play_count: numeric(r.play_count),
  }));

  const hourlyRows = asRpcRows<Record<string, unknown>>(root.hourly).map(
    (r) => ({
      hour: Math.floor(numeric(r.hour)),
      ms_played: numeric(r.ms_played),
      play_count: numeric(r.play_count),
    }),
  );

  const monthsTop = asRpcRows<Record<string, unknown>>(root.months_top).map(
    (r) => ({
      period: String(r.period ?? ""),
      ms_played: numeric(r.ms_played),
      play_count: numeric(r.play_count),
    }),
  );

  const yearsBreakdown = asRpcRows<Record<string, unknown>>(root.years).map(
    (r) => ({
      year: Math.floor(numeric(r.year)),
      ms_played: numeric(r.ms_played),
      play_count: numeric(r.play_count),
    }),
  );

  return {
    totalMs: numeric(totalRaw.total_ms),
    playCount: numeric(totalRaw.play_count),
    sessionCount: numeric(totalRaw.session_count),
    topTracks: asRpcRows(root.top_tracks).map((x) =>
      mapTopItemRow(x as Record<string, unknown>),
    ),
    topArtists: asRpcRows(root.top_artists).map((x) =>
      mapTopItemRow(x as Record<string, unknown>),
    ),
    topAlbums: asRpcRows(root.top_albums).map((x) =>
      mapTopItemRow(x as Record<string, unknown>),
    ),
    listeningOverTime: listeningRows,
    hourlyData: hourlyRows,
    monthsTop,
    yearsBreakdown,
  };
}

const PG_STATEMENT_TIMEOUT = "57014";

export async function getDashboardBundlePayload(
  params: TimeFilterParams,
  limit: number = 50,
): Promise<DashboardBundlePayload> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);
  const rpcArgs = {
    start_date: start,
    end_date: end,
    result_limit: limit,
  };

  let data: unknown = null;
  let error: { message: string; code?: string; details?: string; hint?: string } | null =
    null;

  ({ data, error } = await supabase.rpc("get_dashboard_bundle", rpcArgs));

  if (error?.code === PG_STATEMENT_TIMEOUT) {
    console.warn(
      "[stats] get_dashboard_bundle: timeout (57014) → get_dashboard_bundle_fast",
    );
    ({ data, error } = await supabase.rpc("get_dashboard_bundle_fast", rpcArgs));
  }

  if (!error) {
    const normalized = normalizeDashboardRpcPayload(data);
    if (normalized) {
      try {
        return parseDashboardBundleJson(normalized);
      } catch (parseErr) {
        console.warn("[stats] bundle JSON parse failed", parseErr);
      }
    } else if (data != null) {
      console.warn("[stats] bundle RPC shape inesperado:", typeof data);
    }
  } else {
    console.warn(
      "[stats] dashboard RPC:",
      error.message,
      error.code ?? "",
      error.details ?? "",
      error.hint ?? "",
    );
  }

  const hitTimeout = error?.code === PG_STATEMENT_TIMEOUT;

  /* El fallback legacy vuelve a ejecutar `plays_in_range_with_sessions` varias veces → mismo timeout. */
  if (!hitTimeout) {
    try {
      return await getDashboardLegacyPayload(params, limit);
    } catch (legacyErr) {
      console.error("[stats] legacy dashboard failed", legacyErr);
    }
  }

  return {
    totalMs: 0,
    playCount: 0,
    sessionCount: 0,
    topTracks: [],
    topArtists: [],
    topAlbums: [],
    listeningOverTime: [],
    hourlyData: [],
    monthsTop: [],
    yearsBreakdown: [],
  };
}

export async function getTotalListeningTime(
  params: TimeFilterParams
): Promise<{ total_ms: number; play_count: number; session_count: number }> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_total_listening_time", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  const row = firstRpcRow<{
    total_ms?: unknown;
    play_count?: unknown;
    session_count?: unknown;
  }>(data, { total_ms: 0, play_count: 0, session_count: 0 });
  return {
    total_ms: numeric(row.total_ms),
    play_count: numeric(row.play_count),
    session_count: numeric(row.session_count),
  };
}

export async function getTopTracks(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_top_tracks", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map(mapTopItemRow);
}

export async function getTopArtists(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_top_artists", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map(mapTopItemRow);
}

export async function getTopAlbums(
  params: TimeFilterParams,
  limit: number = 50
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_top_albums", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map(mapTopItemRow);
}

export async function getListeningOverTime(
  params: TimeFilterParams,
  groupBy: "day" | "week" | "month" = "day"
): Promise<ListeningTimeData[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_listening_over_time", {
    start_date: start,
    end_date: end,
    group_by: groupBy,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map((r) => ({
    date: String(r.date ?? ""),
    ms_played: numeric(r.ms_played),
    play_count: numeric(r.play_count),
  }));
}

export async function getHourlyDistribution(
  params: TimeFilterParams
): Promise<HourlyData[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_hourly_distribution", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map((r) => ({
    hour: Math.floor(numeric(r.hour)),
    ms_played: numeric(r.ms_played),
    play_count: numeric(r.play_count),
  }));
}

export async function getHeatmapData(
  year: number
): Promise<{ date: string; count: number; ms_played: number }[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_heatmap_data", {
    target_year: year,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map((r) => ({
    date: String(r.date ?? ""),
    count: Math.floor(numeric(r.count)),
    ms_played: numeric(r.ms_played),
  }));
}
