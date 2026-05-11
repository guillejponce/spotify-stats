import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshSpotifyToken } from "@/lib/spotify";

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

  if (new Date(tokenData.expires_at) <= new Date()) {
    if (!tokenData.refresh_token) return null;

    const newTokens = await refreshSpotifyToken(tokenData.refresh_token);

    await supabase
      .from("spotify_tokens")
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokenData.refresh_token,
        expires_at: new Date(
          Date.now() + newTokens.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    return newTokens.access_token;
  }

  return tokenData.access_token;
}
