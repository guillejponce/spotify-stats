import { createHash } from "crypto";

const API_ROOT = "https://ws.audioscrobbler.com/2.0/";
const AUTH_URL = "https://www.last.fm/api/auth/";

export class LastfmError extends Error {
  constructor(message: string, public code: number | null) {
    super(message);
  }
}

function credentials(): { key: string; secret: string } {
  const key = process.env.LASTFM_API_KEY?.trim();
  const secret = process.env.LASTFM_SHARED_SECRET?.trim();
  if (!key || !secret) {
    throw new LastfmError("Faltan LASTFM_API_KEY y LASTFM_SHARED_SECRET", null);
  }
  return { key, secret };
}

export function isLastfmConfigured(): boolean {
  return Boolean(process.env.LASTFM_API_KEY?.trim() && process.env.LASTFM_SHARED_SECRET?.trim());
}

/** Firma de Last.fm: parámetros ordenados (sin `format`/`callback`) + secret, en md5. */
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .filter((k) => k !== "format" && k !== "callback")
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHash("md5").update(base + secret, "utf8").digest("hex");
}

async function call<T>(
  method: string,
  params: Record<string, string>,
  { signed = false }: { signed?: boolean } = {}
): Promise<T> {
  const { key, secret } = credentials();
  const all: Record<string, string> = { ...params, method, api_key: key };
  if (signed) all.api_sig = sign(all, secret);
  all.format = "json";

  const res = await fetch(`${API_ROOT}?${new URLSearchParams(all)}`, {
    headers: { "User-Agent": "Statsify/1.0" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: number; message?: string })
    | null;
  if (!json) throw new LastfmError(`Last.fm respondió ${res.status}`, null);
  if (typeof json.error === "number") {
    throw new LastfmError(json.message ?? "Error de Last.fm", json.error);
  }
  return json;
}

/** URL a la que se manda a la persona para autorizar Statsify en last.fm. */
export function lastfmAuthUrl(callbackUrl: string): string {
  const { key } = credentials();
  return `${AUTH_URL}?${new URLSearchParams({ api_key: key, cb: callbackUrl })}`;
}

export async function getLastfmSession(token: string): Promise<{ username: string; sessionKey: string }> {
  const json = await call<{ session?: { name?: string; key?: string } }>(
    "auth.getSession",
    { token },
    { signed: true }
  );
  const name = json.session?.name;
  const key = json.session?.key;
  if (!name || !key) throw new LastfmError("Last.fm no devolvió la sesión", null);
  return { username: name, sessionKey: key };
}

export type LastfmUserInfo = {
  username: string;
  profile_url: string | null;
  avatar_url: string | null;
  country: string | null;
  total_scrobbles: number | null;
};

type LastfmImage = { "#text"?: string; size?: string };

function largestImage(images: LastfmImage[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  for (let i = images.length - 1; i >= 0; i--) {
    const url = images[i]?.["#text"];
    if (url) return url;
  }
  return null;
}

export async function getLastfmUserInfo(username: string): Promise<LastfmUserInfo> {
  const json = await call<{
    user?: {
      name?: string;
      url?: string;
      country?: string;
      playcount?: string;
      image?: LastfmImage[];
    };
  }>("user.getInfo", { user: username });
  const u = json.user ?? {};
  const count = Number(u.playcount);
  const country = u.country && u.country !== "None" ? u.country : null;
  return {
    username: u.name ?? username,
    profile_url: u.url ?? null,
    avatar_url: largestImage(u.image),
    country,
    total_scrobbles: Number.isFinite(count) ? count : null,
  };
}

export type LastfmScrobble = {
  artist: string;
  track: string;
  album: string | null;
  /** Inicio de la reproducción. null si está sonando ahora. */
  playedAt: Date | null;
  nowPlaying: boolean;
};

type RawRecentTrack = {
  name?: string;
  artist?: { "#text"?: string; name?: string };
  album?: { "#text"?: string };
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};

/**
 * Scrobbles posteriores a `from` (exclusivo), de más nuevo a más viejo, más el
 * que esté sonando. Con `sessionKey` la llamada va firmada y también funciona
 * si la persona ocultó su actividad reciente.
 */
export async function getLastfmRecentTracks(
  username: string,
  sessionKey: string,
  opts: { from?: Date; page?: number; limit?: number } = {}
): Promise<{ scrobbles: LastfmScrobble[]; totalPages: number }> {
  const params: Record<string, string> = {
    user: username,
    sk: sessionKey,
    limit: String(opts.limit ?? 200),
    page: String(opts.page ?? 1),
  };
  if (opts.from) params.from = String(Math.floor(opts.from.getTime() / 1000) + 1);

  const json = await call<{
    recenttracks?: { track?: RawRecentTrack | RawRecentTrack[]; "@attr"?: { totalPages?: string } };
  }>("user.getRecentTracks", params, { signed: true });

  const raw = json.recenttracks?.track;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const scrobbles: LastfmScrobble[] = [];
  for (const t of list) {
    const artist = t.artist?.["#text"] ?? t.artist?.name ?? "";
    const track = t.name ?? "";
    if (!artist || !track) continue;
    const nowPlaying = t["@attr"]?.nowplaying === "true";
    const uts = Number(t.date?.uts);
    scrobbles.push({
      artist,
      track,
      album: t.album?.["#text"] || null,
      playedAt: Number.isFinite(uts) && uts > 0 ? new Date(uts * 1000) : null,
      nowPlaying,
    });
  }
  const totalPages = Number(json.recenttracks?.["@attr"]?.totalPages);
  return { scrobbles, totalPages: Number.isFinite(totalPages) ? totalPages : 1 };
}
