const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Spotify compares this byte-for-byte against "Redirect URIs" in the developer dashboard:
 * scheme (http/https), host, port, path — no trailing slash.
 */
export function getSpotifyRedirectUri(): string {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ??
    "";

  if (!base) {
    throw new Error(
      "Define SPOTIFY_REDIRECT_URI or NEXT_PUBLIC_APP_URL for Spotify OAuth."
    );
  }

  return `${base}/api/spotify/callback`;
}

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
  "user-top-read",
].join(" ");

export function getSpotifyAuthUrl(): string {
  const redirectUri = getSpotifyRedirectUri();
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    show_dialog: "true",
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function getSpotifyTokens(code: string) {
  const redirectUri = getSpotifyRedirectUri();
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[Spotify] token exchange failed", {
      redirect_uri_sent: redirectUri,
      detail,
    });
    throw new Error(
      `Spotify token error: ${response.status} ${detail || response.statusText}`
    );
  }

  return response.json();
}

export async function refreshSpotifyToken(refreshToken: string) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify refresh error: ${response.statusText}`);
  }

  return response.json();
}

export async function getCurrentlyPlaying(accessToken: string) {
  const response = await fetch(
    `${SPOTIFY_API_BASE}/me/player/currently-playing`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    }
  );

  if (response.status === 204) return null;
  if (!response.ok) {
    if (response.status === 401) throw new Error("EXPIRED_TOKEN");
    throw new Error(`Spotify API error: ${response.statusText}`);
  }

  return response.json();
}

export async function getRecentlyPlayed(accessToken: string, limit: number = 50) {
  const response = await fetch(
    `${SPOTIFY_API_BASE}/me/player/recently-played?limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("EXPIRED_TOKEN");
    throw new Error(`Spotify API error: ${response.statusText}`);
  }

  return response.json();
}
