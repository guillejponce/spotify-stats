import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/app-url";
import { SPOTIFY_CONNECT_STATE_COOKIE, saveSpotifyConnection } from "@/lib/spotify-connect";

export const dynamic = "force-dynamic";

function back(request: NextRequest, status: string) {
  const res = NextResponse.redirect(new URL(`/welcome?spotify=${status}`, request.url));
  res.cookies.delete(SPOTIFY_CONNECT_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;

  const sp = request.nextUrl.searchParams;
  const expected = request.cookies.get(SPOTIFY_CONNECT_STATE_COOKIE)?.value;
  if (!expected || sp.get("state") !== expected) return back(request, "error");
  if (sp.get("error") || !sp.get("code")) return back(request, "denied");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: sp.get("code")!,
      redirect_uri: `${appOrigin(request)}/api/spotify/connect/callback`,
    }),
  });
  if (!res.ok) {
    console.error("[spotify/connect] token exchange failed", res.status, await res.text());
    return back(request, "error");
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  // En modo desarrollo, una cuenta que no está en User Management recibe 403 en /me.
  const me = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  if (me.status === 403) return back(request, "not_allowed");

  await saveSpotifyConnection(ctx.db, ctx.userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresInSec: tokens.expires_in,
  });
  return back(request, "ok");
}
