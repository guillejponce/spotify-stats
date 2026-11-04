import type { UserCtx } from "@/lib/user-context";
import type { ListenRank, NowPlayingListenRanks } from "@/lib/listen-rank-types";

export type { ListenRank, NowPlayingListenRanks } from "@/lib/listen-rank-types";

const EMPTY: ListenRank = { rank: null, plays: 0, ms_played: 0, among: 0 };

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

async function rankFromRollup(
  ctx: UserCtx,
  table: "stats_track_segments" | "stats_artist_segments",
  idColumn: "track_id" | "artist_id",
  id: string,
): Promise<ListenRank | "missing" | null> {
  const supabase = ctx.db;
  const mine = await supabase
    .from(table)
    .select("segment_count, total_ms")
    .eq("user_id", ctx.userId)
    .eq(idColumn, id)
    .maybeSingle();

  if (isMissingRelation(mine.error)) return "missing";
  if (mine.error) {
    console.warn(`[listen-ranks] ${table} mine`, mine.error);
    return null;
  }

  const catalog = await supabase
    .from(table)
    .select(idColumn, { count: "exact", head: true })
    .eq("user_id", ctx.userId);
  if (isMissingRelation(catalog.error)) return "missing";

  const among = catalog.count ?? 0;
  const plays = Number(mine.data?.segment_count ?? 0);
  const ms_played = Number(mine.data?.total_ms ?? 0);

  if (!mine.data || plays <= 0) {
    return { rank: null, plays: 0, ms_played: 0, among };
  }

  const ahead = await supabase
    .from(table)
    .select(idColumn, { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .gt("segment_count", plays);

  if (ahead.error) {
    console.warn(`[listen-ranks] ${table} ahead`, ahead.error);
    return { rank: null, plays, ms_played, among };
  }

  return {
    rank: 1 + (ahead.count ?? 0),
    plays,
    ms_played,
    among,
  };
}

async function rankFromPlays(
  ctx: UserCtx,
  column: "track_id" | "artist_id",
  id: string,
): Promise<ListenRank> {
  const supabase = ctx.db;
  const counted = await supabase
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .eq(column, id);

  const plays = counted.count ?? 0;
  return {
    rank: plays > 0 ? null : null,
    plays,
    ms_played: 0,
    among: 0,
  };
}

async function rankFor(
  ctx: UserCtx,
  rollup: "stats_track_segments" | "stats_artist_segments",
  idColumn: "track_id" | "artist_id",
  id: string,
): Promise<ListenRank> {
  const fromRollup = await rankFromRollup(ctx, rollup, idColumn, id);
  if (fromRollup === "missing") return rankFromPlays(ctx, idColumn, id);
  return fromRollup ?? EMPTY;
}

export async function getNowPlayingListenRanks(
  ctx: UserCtx,
  trackId: string | null,
  artistId: string | null,
): Promise<NowPlayingListenRanks> {
  const [track, artist] = await Promise.all([
    trackId
      ? rankFor(ctx, "stats_track_segments", "track_id", trackId)
      : Promise.resolve(EMPTY),
    artistId
      ? rankFor(ctx, "stats_artist_segments", "artist_id", artistId)
      : Promise.resolve(EMPTY),
  ]);
  return { track, artist };
}
