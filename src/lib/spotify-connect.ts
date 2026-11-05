import type { SupabaseClient } from "@supabase/supabase-js";
import { SPOTIFY_SCOPES, getSpotifyMe } from "@/lib/spotify";

export const SPOTIFY_CONNECT_STATE_COOKIE = "spotify_connect_state";

/** Guarda tokens de Spotify y completa el perfil con `/me`. */
export async function saveSpotifyConnection(
  db: SupabaseClient,
  userId: string,
  tokens: { accessToken: string; refreshToken?: string | null; expiresInSec?: number }
): Promise<void> {
  const row: Record<string, unknown> = {
    id: userId,
    user_id: userId,
    access_token: tokens.accessToken,
    expires_at: new Date(Date.now() + (tokens.expiresInSec ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    scope: SPOTIFY_SCOPES,
    needs_reconnect: false,
  };
  if (tokens.refreshToken) row.refresh_token = tokens.refreshToken;
  const { error } = await db.from("spotify_tokens").upsert(row, { onConflict: "user_id" });
  if (error) console.error("[spotify-connect] spotify_tokens upsert failed", error);

  const me = await getSpotifyMe(tokens.accessToken);
  if (!me) return;
  const extra: Record<string, unknown> = {};
  for (const key of ["country", "followers", "product", "spotify_url"] as const) {
    if (me[key] != null) extra[key] = me[key];
  }
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.display_name && me.display_name) extra.display_name = me.display_name;
  if (!profile?.avatar_url && me.avatar_url) extra.avatar_url = me.avatar_url;
  if (Object.keys(extra).length) {
    const { error: meErr } = await db.from("profiles").update(extra).eq("id", userId);
    if (meErr) console.error("[spotify-connect] profile /me update failed", meErr);
  }
}

/** Sin Spotify, sin Last.fm y sin historial: todavía no tiene de dónde salir ningún dato. */
export async function needsOnboarding(db: SupabaseClient, userId: string): Promise<boolean> {
  const [spotify, lastfm, plays] = await Promise.all([
    db.from("spotify_tokens").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("lastfm_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("plays").select("id").eq("user_id", userId).limit(1),
  ]);
  return !spotify.data && !lastfm.data && !(plays.data?.length);
}
