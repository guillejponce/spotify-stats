import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSpotifyArtistsByIdsWithTokenFallback,
  getSpotifyClientCredentialsToken,
} from "@/lib/spotify";

/** Spotify track/artist IDs are 22-character base62 strings */
const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;

/**
 * Fills missing `artists.image_url` using GET /artists for rows whose `id` is a Spotify id.
 * Usa Client Credentials (`client_credentials`) para catálogo; si falla, prueba `fallbackUserAccessToken`.
 */
export async function enrichArtistsMissingImages(
  supabase: SupabaseClient,
  fallbackUserAccessToken?: string | null,
  maxPerRun = 48
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("artists")
    .select("id")
    .is("image_url", null)
    .limit(maxPerRun);

  if (error || !rows?.length) return 0;

  const ids = Array.from(
    new Set(
      rows
        .map((r) => r.id as string | undefined)
        .filter((id): id is string => !!id && SPOTIFY_ID_RE.test(id))
    )
  );
  if (ids.length === 0) return 0;

  const cc = await getSpotifyClientCredentialsToken();
  const tokens = [cc, fallbackUserAccessToken] as (
    | string
    | null
    | undefined
  )[];
  if (!tokens.some(Boolean)) {
    console.warn(
      "[enrich-artist-images] Sin token Spotify: definí CLIENT_ID + SECRET o conectá cuenta."
    );
    return 0;
  }

  let enriched = 0;
  const artists = await getSpotifyArtistsByIdsWithTokenFallback(ids, tokens);
