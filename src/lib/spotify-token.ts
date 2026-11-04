import { refreshSpotifyToken } from "@/lib/spotify";
import type { UserCtx } from "@/lib/user-context";

/** Renovar un poco antes de `expires_at` (relojes / sesión real vs BD). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function loadTokenRow(ctx: UserCtx) {
  const { data } = await ctx.db
    .from("spotify_tokens")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data;
}

async function persistRefreshedTokens(
  ctx: UserCtx,
  refreshToken: string,
  previousRefreshToken: string
) {
  const newTokens = await refreshSpotifyToken(refreshToken);

  await ctx.db
    .from("spotify_tokens")
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || previousRefreshToken,
      expires_at: new Date(
        Date.now() + newTokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", ctx.userId);

  return newTokens.access_token as string;
}

/** Fuerza POST refresh (p. ej. Spotify devolvió 401 pero `expires_at` en BD sigue “válido”). */
export async function forceRefreshSpotifyAccessToken(
  ctx: UserCtx
): Promise<string | null> {
  const tokenData = await loadTokenRow(ctx);
  if (!tokenData?.refresh_token) return null;

  try {
    return await persistRefreshedTokens(
      ctx,
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
  ctx: UserCtx
): Promise<string | null> {
  const tokenData = await loadTokenRow(ctx);
  if (!tokenData) return null;

  const expiresAtMs = new Date(tokenData.expires_at).getTime();
  const shouldRefresh = expiresAtMs <= Date.now() + EXPIRY_BUFFER_MS;

  if (!shouldRefresh) return tokenData.access_token;

  if (!tokenData.refresh_token) {
    return expiresAtMs > Date.now() ? tokenData.access_token : null;
  }

  try {
    return await persistRefreshedTokens(
      ctx,
      tokenData.refresh_token,
      tokenData.refresh_token
    );
  } catch (e) {
    console.warn("[spotify-token] scheduled refresh failed", e);
    return expiresAtMs > Date.now() ? tokenData.access_token : null;
  }
}
