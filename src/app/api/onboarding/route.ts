import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLastfmRecentTracks, isLastfmConfigured } from "@/lib/lastfm";
import { loadLastfmAccount } from "@/lib/lastfm-sync";

export const dynamic = "force-dynamic";

/** Last.fm "está recibiendo" si tiene un scrobble en los últimos 14 días. */
const RECENT_SCROBBLE_MS = 14 * 24 * 60 * 60 * 1000;

/** `?light=1` se salta la consulta a Last.fm (para el aviso de reconexión en cada carga). */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  const light = request.nextUrl.searchParams.get("light") === "1";

  const [tokenRes, account, importsRes, identity] = await Promise.all([
    ctx.db
      .from("spotify_tokens")
      .select("refresh_token, needs_reconnect")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    loadLastfmAccount(ctx.db, ctx.userId),
    ctx.db
      .from("imports")
      .select("completed_at, status")
      .eq("user_id", ctx.userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
    ctx.db.auth.admin.getUserById(ctx.userId),
  ]);

  let latestScrobbleAt: string | null = account?.last_scrobble_at ?? null;
  if (account && !light) {
    try {
      const { scrobbles } = await getLastfmRecentTracks(account.username, account.session_key, { limit: 1 });
      const newest = scrobbles.find((s) => s.nowPlaying) ?? scrobbles[0];
      if (newest) latestScrobbleAt = (newest.playedAt ?? new Date()).toISOString();
    } catch {
      // Se usa el último scrobble guardado.
    }
  }

  const providers = (identity.data.user?.identities ?? []).map((i) => i.provider);
  const token = tokenRes.data;

  return NextResponse.json({
    loginProvider: providers.includes("spotify") ? "spotify" : providers[0] ?? null,
    lastfmConfigured: isLastfmConfigured(),
    spotify: {
      connected: Boolean(token?.refresh_token),
      needsReconnect: Boolean(token?.needs_reconnect),
    },
    lastfm: account
      ? {
          connected: true,
          username: account.username,
          lastSyncedAt: account.last_synced_at,
          lastError: account.last_error,
          latestScrobbleAt,
          receiving:
            latestScrobbleAt != null &&
            Date.now() - new Date(latestScrobbleAt).getTime() < RECENT_SCROBBLE_MS,
        }
      : { connected: false },
    history: {
      imported: Boolean(importsRes.data?.length),
      lastImportAt: importsRes.data?.[0]?.completed_at ?? null,
    },
  });
}
