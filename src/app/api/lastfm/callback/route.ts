import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLastfmSession, getLastfmUserInfo } from "@/lib/lastfm";
import { syncLastfmForUser } from "@/lib/lastfm-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function back(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/welcome?lastfm=${status}`, request.url));
}

/** Vuelta de last.fm con `token`: se cambia por una sesión que no vence. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;

  const token = request.nextUrl.searchParams.get("token");
  if (!token) return back(request, "denied");

  try {
    const { username, sessionKey } = await getLastfmSession(token);

    const { data: taken } = await ctx.db
      .from("lastfm_accounts")
      .select("user_id")
      .eq("username", username)
      .neq("user_id", ctx.userId)
      .maybeSingle();
    if (taken) return back(request, "taken");

    const info = await getLastfmUserInfo(username).catch(() => null);
    const { data: existing } = await ctx.db
      .from("lastfm_accounts")
      .select("username, last_scrobble_at")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const sameAccount = existing?.username?.toLowerCase() === username.toLowerCase();

    const { error } = await ctx.db.from("lastfm_accounts").upsert(
      {
        user_id: ctx.userId,
        username,
        session_key: sessionKey,
        connected_at: new Date().toISOString(),
        last_scrobble_at: sameAccount ? existing?.last_scrobble_at ?? null : null,
        last_error: null,
        profile_url: info?.profile_url ?? null,
        avatar_url: info?.avatar_url ?? null,
        country: info?.country ?? null,
        total_scrobbles: info?.total_scrobbles ?? null,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    await syncLastfmForUser(ctx).catch((e) => console.warn("[lastfm/callback] first sync", e));
    return back(request, "ok");
  } catch (e) {
    console.error("[lastfm/callback]", e);
    return back(request, "error");
  }
}
