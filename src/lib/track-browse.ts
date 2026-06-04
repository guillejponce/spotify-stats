import { createServerSupabaseClient } from "./supabase";
import { buildDateFilterChile } from "./chile-stats-range";
import type { TimeFilterParams, TopItem } from "@/types/database";

function numeric(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function mapTopLikeRow(r: Record<string, unknown>): TopItem {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    image_url: r.image_url == null ? null : String(r.image_url),
    play_count: numeric(r.play_count),
    total_ms_played: numeric(r.total_ms_played),
  };
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export type TrackBrowseRow = TopItem & { artist_name?: string };

function mapTrackRow(r: Record<string, unknown>): TrackBrowseRow {
  return {
    ...mapTopLikeRow(r),
    artist_name: r.artist_name != null ? String(r.artist_name) : undefined,
  };
}

export async function fetchTracksLeaderboard(
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<TrackBrowseRow[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc("get_tracks_leaderboard", {
    start_date: start,
    end_date: end,
    search_query: q,
    result_offset: options.offset,
    result_limit: options.limit,
  });

  if (error) {
    if (
      error.message?.includes("get_tracks_leaderboard") ||
      error.code === "PGRST202"
    ) {
      return await fetchTracksLeaderboardFallback(params, options);
    }
    throw error;
  }
  return asRows(data).map(mapTrackRow);
}

async function fetchTracksLeaderboardFallback(
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<TrackBrowseRow[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  // Legacy: get_top_tracks agrupa por sesiones (~15 min); solo si falta get_tracks_leaderboard.
  const { data, error } = await supabase.rpc("get_top_tracks", {
    start_date: start,
    end_date: end,
    result_limit: 500,
  });

  if (error) throw error;

  let rows = asRows(data).map(mapTrackRow);

  if (options.search.trim()) {
    const lower = options.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        (r.artist_name && r.artist_name.toLowerCase().includes(lower))
    );
  }

  return rows.slice(options.offset, options.offset + options.limit);
}
