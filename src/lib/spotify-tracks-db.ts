import type { SupabaseClient } from "@supabase/supabase-js";

export type UpsertTrackFromApiInput = {
  /** Spotify Web API track `id`. */
  spotifyTrackId: string;
  name: string;
  artist_id: string;
  album_id: string | null;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  spotify_url: string | null;
  popularity: number | null;
};

/**
 * Persist a track row and return **`tracks.id`** (database PK).
 * Supports `tracks(spotify_id)` + generated `id` (import flow) or `tracks(id)` = Spotify id (`base_script` style).
 */
export async function upsertTrackAndGetPk(
  supabase: SupabaseClient,
  payload: UpsertTrackFromApiInput
): Promise<string | null> {
  const row = {
    name: payload.name,
    artist_id: payload.artist_id,
    album_id: payload.album_id,
    duration_ms: payload.duration_ms,
    explicit: payload.explicit,
    preview_url: payload.preview_url,
    spotify_url: payload.spotify_url,
    popularity: payload.popularity,
  };

  const withSpotifyId = await supabase
    .from("tracks")
    .upsert(
      {
        spotify_id: payload.spotifyTrackId,
        ...row,
      },
      { onConflict: "spotify_id" }
    )
    .select("id")
    .maybeSingle();

  if (!withSpotifyId.error && withSpotifyId.data?.id)
    return withSpotifyId.data.id;

  const msg = withSpotifyId.error?.message ?? "";
  const missingSpotifyColumn =
    withSpotifyId.error?.code === "PGRST204" ||
    msg.includes("spotify_id") ||
    msg.includes("'spotify_id'");

  if (!missingSpotifyColumn && withSpotifyId.error) {
    console.error("[tracks-db] upsert (spotify_id)", withSpotifyId.error);
    return null;
  }

  const legacy = await supabase
    .from("tracks")
    .upsert(
      {
        id: payload.spotifyTrackId,
        ...row,
      },
      { onConflict: "id" }
    )
    .select("id")
    .maybeSingle();

  if (!legacy.error && legacy.data?.id) return legacy.data.id;
  console.error("[tracks-db] upsert (id=key)", legacy.error);
  return null;
}
