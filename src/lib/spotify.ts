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

/** Token de aplicación para endpoints de catálogo (ej. varios artistas). Evita 403 con token de usuario. */
let ccTokenCache: { token: string; expiresAtMs: number } | null = null;

export async function getSpotifyClientCredentialsToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;

  const now = Date.now();
  if (ccTokenCache && ccTokenCache.expiresAtMs > now + 30_000) {
    return ccTokenCache.token;
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.warn(
      "[Spotify] client_credentials failed",
      response.status,
      raw.slice(0, 280)
    );
    return null;
  }

  try {
    const json = JSON.parse(raw) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    const ttl =
      typeof json.expires_in === "number" && json.expires_in > 120
        ? json.expires_in
        : 3600;
    ccTokenCache = {
      token: json.access_token,
      expiresAtMs: now + ttl * 1000 - 120_000,
    };
    return ccTokenCache.token;
  } catch {
    return null;
  }
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

export type SpotifyArtistApi = {
  id: string;
  name?: string;
  images?: { url?: string }[];
  external_urls?: { spotify?: string };
};

/** GET /artists?ids= (max 50 ids per HTTP request). */
export async function getSpotifyArtistsByIds(
  accessToken: string,
  ids: string[]
): Promise<SpotifyArtistApi[]> {
  if (ids.length === 0) return [];
  const out: SpotifyArtistApi[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `${SPOTIFY_API_BASE}/artists?ids=${encodeURIComponent(chunk.join(","))}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    });

    const raw = await response.text();
    if (!response.ok) {
      if (response.status === 401) throw new Error("EXPIRED_TOKEN");
      const hint =
        raw && raw.length ? ` · ${raw.slice(0, 240)}` : "";
      throw new Error(
        `Spotify artists batch: ${response.status} ${response.statusText}${hint}`
      );
    }

    const json = JSON.parse(raw) as {
      artists?: (SpotifyArtistApi | null)[];
    };
    for (const a of json.artists ?? []) {
      if (a?.id) out.push(a);
    }
  }

  return out;
}

/** Prueba cada token hasta que uno devuelva 200 en GET /artists (403/401 → siguiente token). */
export async function getSpotifyArtistsByIdsWithTokenFallback(
  ids: string[],
  tokensInOrder: (string | null | undefined)[]
): Promise<SpotifyArtistApi[]> {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of tokensInOrder) {
    if (t && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }
  let lastFail: unknown;
  for (const bearer of tokens) {
    try {
      return await getSpotifyArtistsByIds(bearer, ids);
    } catch (e) {
      lastFail = e;
      const m = e instanceof Error ? e.message : String(e);
      if (/403|401|EXPIRED_TOKEN/.test(m)) continue;
      throw e;
    }
  }
  if (lastFail) {
    const m =
      lastFail instanceof Error ? lastFail.message : String(lastFail);
    console.warn(
      "[Spotify] GET /artists falló para todos los tokens:",
      m.slice(0, 280)
    );
  }
  return [];
}
