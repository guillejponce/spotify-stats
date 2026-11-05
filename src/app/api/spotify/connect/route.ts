import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/app-url";
import { SPOTIFY_SCOPES } from "@/lib/spotify";
import { SPOTIFY_CONNECT_STATE_COOKIE } from "@/lib/spotify-connect";

export const dynamic = "force-dynamic";

/**
 * Conecta Spotify a una cuenta que entró con Google, sin cambiar el login.
 * Requiere `<app>/api/spotify/connect/callback` en las Redirect URIs de Spotify.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.redirect(new URL("/welcome?spotify=error", request.url));

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${appOrigin(request)}/api/spotify/connect/callback`,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "true",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(SPOTIFY_CONNECT_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
