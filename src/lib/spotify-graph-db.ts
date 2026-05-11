import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSpotifyAlbumReleaseDate } from "@/lib/utils";

/**
 * Match `/api/import` artist rows: unique on `name`, then fall back to Spotify id PK (base_script).
 */
export async function upsertArtistAndGetDbId(
  supabase: SupabaseClient,
  payload: {
    spotifyArtistId: string;
    name: string;
    image_url: string | null;
    spotify_url: string | null;
  }
): Promise<string | null> {
  if (!payload.name) return null;

  const extras = {
    image_url: payload.image_url,
    spotify_url: payload.spotify_url,
  };

  const byName = await supabase
    .from("artists")
    .upsert({ name: payload.name, ...extras }, { onConflict: "name" })
    .select("id")
    .maybeSingle();

  if (!byName.error && byName.data?.id) return byName.data.id;

  const legacy = await supabase
    .from("artists")
    .upsert(
      {
        id: payload.spotifyArtistId,
        name: payload.name,
        ...extras,
      },
      { onConflict: "id" }
    )
    .select("id")
    .maybeSingle();

  if (!legacy.error && legacy.data?.id) return legacy.data.id;
  console.error("[artists-db] upsert", byName.error, legacy.error);
  return null;
}

/**
 * Match import: `(name, artist_id)` uniqueness; fallback to Spotify album id PK (base_script).
 */
export async function upsertAlbumAndGetDbId(
  supabase: SupabaseClient,
  payload: {
    spotifyAlbumId: string | null;
    name: string;
    artist_db_id: string;
    image_url: string | null;
    release_date: string | null;
    album_type: string | null;
    spotify_url: string | null;
  }
): Promise<string | null> {
  if (!payload.name) return null;

  const extras = {
    image_url: payload.image_url,
    release_date: normalizeSpotifyAlbumReleaseDate(payload.release_date),
    album_type: payload.album_type,
    spotify_url: payload.spotify_url,
  };

  const byPair = await supabase
    .from("albums")
    .upsert(
      {
        name: payload.name,
        artist_id: payload.artist_db_id,
        ...extras,
      },
      { onConflict: "name,artist_id" }
    )
    .select("id")
    .maybeSingle();

  if (!byPair.error && byPair.data?.id) return byPair.data.id;

  const noCompositeConstraint = byPair.error?.code === "42P10";

  if (payload.spotifyAlbumId) {
    const legacy = await supabase
      .from("albums")
      .upsert(
        {
          id: payload.spotifyAlbumId,
          name: payload.name,
          artist_id: payload.artist_db_id,
          ...extras,
        },
        { onConflict: "id" }
      )
      .select("id")
      .maybeSingle();

    if (!legacy.error && legacy.data?.id) return legacy.data.id;
    console.error("[albums-db] upsert legacy", legacy.error);
  }

  if (!noCompositeConstraint && byPair.error) {
    console.error("[albums-db] upsert (name,artist_id)", byPair.error);
  }
  return null;
}
