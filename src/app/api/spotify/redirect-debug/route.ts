import { NextResponse } from "next/server";
import { getSpotifyRedirectUri } from "@/lib/spotify";

/** Dev helper: Spotify requires this exact URI in Dashboard Redirect URIs. Disabled in production. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const redirectUri = getSpotifyRedirectUri();

  return NextResponse.json(
    {
      redirectUri,
      authorizeUrlSnippet: `/api/spotify/auth → Location → ...redirect_uri=${encodeURIComponent(redirectUri)}`,
      checklist: [
        "Spotify Dashboard → your app → Settings → Redirect URIs must list redirectUri exactly (no trailing slash).",
        "Click Save at the bottom of the Spotify Settings page.",
        "Open the site at the SAME host/port as SPOTIFY_REDIRECT_URI before clicking Connect.",
      ],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
