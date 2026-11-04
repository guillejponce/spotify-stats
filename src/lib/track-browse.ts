import type { UserCtx } from "@/lib/user-context";
import {
  asRows,
  buildLeaderboardRangeWithPrev,
  mapRankFields,
  numeric,
} from "./rank-delta";
import type { TimeFilterParams, TopItem } from "@/types/database";

function mapTopLikeRow(r: Record<string, unknown>): TopItem {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    image_url: r.image_url == null ? null : String(r.image_url),
    play_count: numeric(r.play_count),
    total_ms_played: numeric(r.total_ms_played),
    ...mapRankFields(r),
  };
}

export type TrackBrowseRow = TopItem & { artist_name?: string };

function mapTrackRow(r: Record<string, unknown>): TrackBrowseRow {
  return {
    ...mapTopLikeRow(r),
    artist_name: r.artist_name != null ? String(r.artist_name) : undefined,
  };
}

export async function fetchTracksLeaderboard(
  ctx: UserCtx,
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number; withDelta?: boolean }
): Promise<TrackBrowseRow[]> {
  if (options.withDelta === false) {
    return fetchTracksLeaderboardLegacy(ctx, params, options);
  }
  const supabase = ctx.db;
  const { start, end, prevEnd } = buildLeaderboardRangeWithPrev(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc("get_tracks_leaderboard_with_delta", {
    p_user_id: ctx.userId,
    start_date: start,
    end_date: end,
    prev_end_date: prevEnd,
    search_query: q,
    result_offset: options.offset,
    result_limit: options.limit,
  });

  if (error) {
    if (
      error.message?.includes("get_tracks_leaderboard_with_delta") ||
      error.code === "PGRST202"
    ) {
      return await fetchTracksLeaderboardLegacy(ctx, params, options);
    }
    throw error;
  }
  return asRows(data).map(mapTrackRow);
}

async function fetchTracksLeaderboardLegacy(
  ctx: UserCtx,
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<TrackBrowseRow[]> {
  const supabase = ctx.db;
  const { start, end } = buildLeaderboardRangeWithPrev(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc("get_tracks_leaderboard", {
    p_user_id: ctx.userId,
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
      return await fetchTracksLeaderboardFallback(ctx, params, options);
    }
    throw error;
  }
  return asRows(data).map((r, i) => ({
    ...mapTrackRow(r),
    rank: options.offset + i + 1,
  }));
}

async function fetchTracksLeaderboardFallback(
  ctx: UserCtx,
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<TrackBrowseRow[]> {
  const supabase = ctx.db;
  const { start, end } = buildLeaderboardRangeWithPrev(params);

  const { data, error } = await supabase.rpc("get_top_tracks", {
    p_user_id: ctx.userId,
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

  return rows.slice(options.offset, options.offset + options.limit).map((r, i) => ({
    ...r,
    rank: options.offset + i + 1,
  }));
}
