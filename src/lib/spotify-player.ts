import { createServerSupabaseClient } from "@/lib/supabase";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export class SpotifyPlayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | "NOT_CONNECTED"
      | "EXPIRED"
      | "PREMIUM"
      | "NO_DEVICE"
      | "FORBIDDEN"
      | "SPOTIFY",
  ) {
    super(message);
    this.name = "SpotifyPlayerError";
  }
}

export type PlayerTrack = {
  id: string | null;
  uri: string | null;
  name: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number;
};

export type PlayerSnapshot = {
  is_playing: boolean;
  progress_ms: number;
  device: { id: string | null; name: string | null } | null;
  track: PlayerTrack | null;
  queue: PlayerTrack[];
};

type SpotifyImage = { url?: string };
type SpotifyArtist = { name?: string };
type SpotifyAlbum = { name?: string; images?: SpotifyImage[] };
type SpotifyItem = {
  id?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  type?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  show?: { name?: string };
  images?: SpotifyImage[];
};

type PlaybackState = {
  is_playing?: boolean;
  progress_ms?: number;
  device?: { id?: string; name?: string } | null;
  item?: SpotifyItem | null;
};

function mapItem(item: SpotifyItem | null | undefined): PlayerTrack | null {
  if (!item?.name) return null;
  const artist =
    (item.artists ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ") ||
    item.show?.name ||
    "";
  const art =
    item.album?.images?.[0]?.url || item.images?.[0]?.url || null;
  return {
    id: item.id ?? null,
    uri: item.uri ?? null,
    name: item.name,
    artist,
    album: item.album?.name ?? null,
    album_art_url: art,
    duration_ms: Number(item.duration_ms ?? 0),
  };
}

async function spotifyFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = createServerSupabaseClient();
  let token = await getSpotifyAccessToken(supabase);
  if (!token) {
    throw new SpotifyPlayerError(
      "No hay sesión de Spotify",
      401,
      "NOT_CONNECTED",
    );
  }

  const run = (access: string) =>
    fetch(`${SPOTIFY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${access}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

  let res = await run(token);
  if (res.status === 401) {
    const fresh = await forceRefreshSpotifyAccessToken(supabase);
    if (!fresh) {
      throw new SpotifyPlayerError("Spotify expiró", 401, "EXPIRED");
    }
    token = fresh;
    res = await run(token);
  }
  return res;
}

function throwIfPlayerFailed(res: Response, body: string) {
  if (res.ok || res.status === 204) return;
  const lower = body.toLowerCase();
  if (res.status === 404 || lower.includes("no active device")) {
    throw new SpotifyPlayerError(
      "No hay un dispositivo de Spotify activo. Abre la app en el teléfono o la computadora.",
      404,
      "NO_DEVICE",
    );
  }
  if (res.status === 403 && lower.includes("premium")) {
    throw new SpotifyPlayerError(
      "Spotify Premium es necesario para controlar la reproducción.",
      403,
      "PREMIUM",
    );
  }
  if (res.status === 403) {
    throw new SpotifyPlayerError(
      "Falta permiso para controlar Spotify. Vuelve a conectar la cuenta.",
      403,
      "FORBIDDEN",
    );
  }
  throw new SpotifyPlayerError(
    `Spotify ${res.status}: ${body.slice(0, 180) || res.statusText}`,
    res.status,
    "SPOTIFY",
  );
}

export async function getPlayerSnapshot(): Promise<PlayerSnapshot> {
  const [stateRes, queueRes] = await Promise.all([
    spotifyFetch("/me/player"),
    spotifyFetch("/me/player/queue"),
  ]);

  if (stateRes.status === 401) {
    throw new SpotifyPlayerError("Spotify expiró", 401, "EXPIRED");
  }

  let state: PlaybackState | null = null;

  if (stateRes.status !== 204 && stateRes.ok) {
    state = (await stateRes.json()) as PlaybackState;
  } else if (!stateRes.ok && stateRes.status !== 204) {
    const body = await stateRes.text();
    throwIfPlayerFailed(stateRes, body);
  }

  let queueItems: SpotifyItem[] = [];
  let queueCurrent: SpotifyItem | null = null;
  if (queueRes.ok) {
    const json = (await queueRes.json()) as {
      currently_playing?: SpotifyItem | null;
      queue?: SpotifyItem[];
    };
    queueCurrent = json.currently_playing ?? null;
    queueItems = json.queue ?? [];
  }

  const track = mapItem(state?.item ?? queueCurrent);
  return {
    is_playing: Boolean(state?.is_playing),
    progress_ms: Number(state?.progress_ms ?? 0),
    device: state?.device
      ? {
          id: state.device.id ?? null,
          name: state.device.name ?? null,
        }
      : null,
    track,
    queue: queueItems
      .map((item) => mapItem(item))
      .filter((t): t is PlayerTrack => t != null)
      .slice(0, 20),
  };
}

export async function controlPlayback(
  action: "play" | "pause" | "next" | "previous",
): Promise<void> {
  const path =
    action === "play"
      ? "/me/player/play"
      : action === "pause"
        ? "/me/player/pause"
        : action === "next"
          ? "/me/player/next"
          : "/me/player/previous";
  const method = action === "next" || action === "previous" ? "POST" : "PUT";
  const res = await spotifyFetch(path, { method });
  const body = res.status === 204 ? "" : await res.text();
  throwIfPlayerFailed(res, body);
}
