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
  platformData: { platform: string; play_count: number; ms_played: number }[];
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

function parseDashboardBundleJson(blob: unknown): DashboardBundlePayload {
  const root =
    blob && typeof blob === "object"
      ? (blob as Record<string, unknown>)
      : {};

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

  const platformRows = asRpcRows<Record<string, unknown>>(root.platform).map(
    (r) => ({
      platform: String(r.platform ?? ""),
      play_count: numeric(r.play_count),
      ms_played: numeric(r.ms_played),
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
    platformData: platformRows,
    monthsTop,
    yearsBreakdown,
  };
}

export async function getDashboardBundlePayload(
  params: TimeFilterParams,
  limit: number = 50,
): Promise<DashboardBundlePayload> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_dashboard_bundle", {
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return parseDashboardBundleJson(data);
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

export async function getPlatformBreakdown(
  params: TimeFilterParams
): Promise<{ platform: string; play_count: number; ms_played: number }[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_platform_breakdown", {
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  return asRpcRows<Record<string, unknown>>(data).map((r) => ({
    platform: String(r.platform ?? ""),
    play_count: numeric(r.play_count),
    ms_played: numeric(r.ms_played),
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
