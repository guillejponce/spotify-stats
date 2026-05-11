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

export type AlbumBrowseRow = TopItem;

export async function fetchAlbumsLeaderboard(
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<AlbumBrowseRow[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc("get_albums_leaderboard", {
    start_date: start,
    end_date: end,
    search_query: q,
    result_offset: options.offset,
    result_limit: options.limit,
  });

  if (error) throw error;
  return asRows(data).map(mapTopLikeRow);
}

export async function fetchAlbumPeriodStats(
  params: TimeFilterParams,
  albumId: string
): Promise<{ play_count: number; total_ms_played: number }> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_album_period_stats", {
    album_ref: albumId,
    start_date: start,
    end_date: end,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const o = (row ?? {}) as Record<string, unknown>;
  return {
    play_count: numeric(o.play_count),
    total_ms_played: numeric(o.total_ms_played),
  };
}

export type TrackPlayCountRow = {
  track_id: string;
  play_count: number;
  total_ms_played: number;
};

export async function fetchTrackPlayCountsInPeriod(
  params: TimeFilterParams,
  spotifyTrackIds: string[]
): Promise<TrackPlayCountRow[]> {
  if (spotifyTrackIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { start, end } = buildDateFilterChile(params);

  const { data, error } = await supabase.rpc("get_track_play_counts_in_period", {
    track_ids: spotifyTrackIds,
    start_date: start,
    end_date: end,
  });

  if (error) throw error;

  return asRows(data).map((r) => ({
    track_id: String(r.track_id ?? ""),
    play_count: numeric(r.play_count),
    total_ms_played: numeric(r.total_ms_played),
  }));
}

export type AlbumDbRow = {
  id: string;
  name: string;
  image_url: string | null;
  spotify_url: string | null;
  artist_name: string | null;
};

export async function fetchAlbumFromDb(albumId: string): Promise<AlbumDbRow | null> {
  const supabase = createServerSupabaseClient();
  const { data: album, error: aErr } = await supabase
    .from("albums")
    .select("id, name, image_url, spotify_url, artist_id")
    .eq("id", albumId)
    .maybeSingle();

  if (aErr || !album) return null;

  let artist_name: string | null = null;
  if (album.artist_id) {
    const { data: ar } = await supabase
      .from("artists")
      .select("name")
      .eq("id", album.artist_id)
      .maybeSingle();
    artist_name = (ar?.name as string) ?? null;
  }

  return {
    id: album.id as string,
    name: album.name as string,
    image_url: (album.image_url as string | null) ?? null,
    spotify_url: (album.spotify_url as string | null) ?? null,
    artist_name,
  };
}
