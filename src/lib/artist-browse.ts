import { createServerSupabaseClient } from "./supabase";
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

export type ArtistBrowseRow = TopItem;

export async function fetchArtistsLeaderboard(
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<ArtistBrowseRow[]> {
  const supabase = createServerSupabaseClient();
  const { start, end, prevEnd } = buildLeaderboardRangeWithPrev(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc(
    "get_artists_leaderboard_with_delta",
    {
      start_date: start,
      end_date: end,
      prev_end_date: prevEnd,
      search_query: q,
      result_offset: options.offset,
      result_limit: options.limit,
    }
  );

  if (error) {
    if (
      error.message?.includes("get_artists_leaderboard_with_delta") ||
      error.code === "PGRST202"
    ) {
      return await fetchArtistsLeaderboardLegacy(params, options);
    }
    throw error;
  }
  return asRows(data).map(mapTopLikeRow);
}

async function fetchArtistsLeaderboardLegacy(
  params: TimeFilterParams,
  options: { search: string; offset: number; limit: number }
): Promise<ArtistBrowseRow[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildLeaderboardRangeWithPrev(params);
  const q = options.search.trim() || null;

  const { data, error } = await supabase.rpc("get_artists_leaderboard", {
    start_date: start,
    end_date: end,
    search_query: q,
    result_offset: options.offset,
    result_limit: options.limit,
  });

  if (error) throw error;
  return asRows(data).map((r, i) => ({
    ...mapTopLikeRow(r),
    rank: options.offset + i + 1,
  }));
}

export async function fetchArtistTracksInPeriod(
  params: TimeFilterParams,
  artistId: string,
  limit: number = 80
): Promise<TopItem[]> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildLeaderboardRangeWithPrev(params);

  const { data, error } = await supabase.rpc("get_artist_top_tracks_in_period", {
    artist_ref: artistId,
    start_date: start,
    end_date: end,
    result_limit: limit,
  });

  if (error) throw error;
  return asRows(data).map(mapTopLikeRow);
}

export async function fetchArtistPeriodStats(
  params: TimeFilterParams,
  artistId: string
): Promise<{ play_count: number; total_ms_played: number }> {
  const supabase = createServerSupabaseClient();
  const { start, end } = buildLeaderboardRangeWithPrev(params);

  const { data, error } = await supabase.rpc("get_artist_period_stats", {
    artist_ref: artistId,
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

export type ArtistProfile = {
  id: string;
  name: string;
  image_url: string | null;
  spotify_url: string | null;
  genres: string[] | null;
};

export async function fetchArtistProfile(
  artistId: string
): Promise<ArtistProfile | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("artists")
    .select("id, name, image_url, spotify_url, genres")
    .eq("id", artistId)
    .maybeSingle();

  if (error || !data) return null;

  let imageUrl = (data.image_url as string | null) ?? null;
  if (!imageUrl) {
    const { findAlbumCoverForArtist } = await import(
      "@/lib/enrich-artist-images"
    );
    imageUrl = await findAlbumCoverForArtist(supabase, artistId);
    if (imageUrl) {
      // Persistir para próximas visitas / listados
      void supabase
        .from("artists")
        .update({ image_url: imageUrl })
        .eq("id", artistId)
        .is("image_url", null);
    }
  }

  const g = data.genres as string[] | null;
  return {
    id: data.id as string,
    name: data.name as string,
    image_url: imageUrl,
    spotify_url: (data.spotify_url as string | null) ?? null,
    genres: Array.isArray(g) ? g : null,
  };
}
