import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshSpotifyToken } from "@/lib/spotify";

/** Renovar un poco antes de `expires_at` (relojes / sesión real vs BD). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function persistRefreshedTokens(
  supabase: SupabaseClient,
  refreshToken: string,
  previousRefreshToken: string
) {
  const newTokens = await refreshSpotifyToken(refreshToken);

  await supabase
    .from("spotify_tokens")
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || previousRefreshToken,
      expires_at: new Date(
        Date.now() + newTokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  return newTokens.access_token as string;
}

/** Fuerza POST refresh (p. ej. Spotify devolvió 401 pero `expires_at` en BD sigue “válido”). */
export async function forceRefreshSpotifyAccessToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: tokenData } = await supabase
    .from("spotify_tokens")
    .select("*")
    .eq("id", "default")
    .single();

  if (!tokenData?.refresh_token) return null;

  try {
    return await persistRefreshedTokens(
      supabase,
      tokenData.refresh_token,
      tokenData.refresh_token
    );
  } catch (e) {
    console.warn("[spotify-token] forceRefresh failed", e);
    return null;
  }
}

/** Valid access_token for Spotify Web API calls, refreshing if stale. */
export async function getSpotifyAccessToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: tokenData } = await supabase
    .from("spotify_tokens")
    .select("*")
    .eq("id", "default")
    .single();

  if (!tokenData) return null;

  const expiresAtMs = new Date(tokenData.expires_at).getTime();
  const shouldRefresh = expiresAtMs <= Date.now() + EXPIRY_BUFFER_MS;

  if (!shouldRefresh) return tokenData.access_token;

  if (!tokenData.refresh_token) {
    return expiresAtMs > Date.now() ? tokenData.access_token : null;
  }

  try {
    return await persistRefreshedTokens(
      supabase,
      tokenData.refresh_token,
      tokenData.refresh_token
    );
  } catch (e) {
    console.warn("[spotify-token] scheduled refresh failed", e);
    return expiresAtMs > Date.now() ? tokenData.access_token : null;
  }
}
