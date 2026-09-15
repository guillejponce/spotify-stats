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
  album_type: string | null;
  release_date: string | null;
  track_number: number | null;
  total_tracks: number | null;
  popularity: number | null;
};

export type PlayerSnapshot = {
  is_playing: boolean;
  progress_ms: number;
  device: { id: string | null; name: string | null } | null;
  track: PlayerTrack | null;
  queue: PlayerTrack[];
};

type SpotifyImage = { url?: string };
type SpotifyArtist = { id?: string; name?: string };
type SpotifyAlbum = {
  id?: string;
  name?: string;
  images?: SpotifyImage[];
  album_type?: string;
  release_date?: string;
  total_tracks?: number;
};
type SpotifyItem = {
  id?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  type?: string;
  popularity?: number;
  track_number?: number;
  disc_number?: number;
  explicit?: boolean;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  show?: { name?: string };
  images?: SpotifyImage[];
  external_urls?: { spotify?: string };
  external_ids?: { isrc?: string };
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
    album_type: item.album?.album_type ?? null,
    release_date: item.album?.release_date ?? null,
    track_number:
      typeof item.track_number === "number" ? item.track_number : null,
    total_tracks:
      typeof item.album?.total_tracks === "number"
        ? item.album.total_tracks
        : null,
    popularity: typeof item.popularity === "number" ? item.popularity : null,
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

function albumTypeEs(raw: string | null | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (t === "album") return "álbum";
  if (t === "single") return "single";
  if (t === "compilation") return "recopilatorio";
  return raw || "lanzamiento";
}

function popularityLabel(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 85) return "hit global ahora (muy alta)";
  if (n >= 70) return "muy popular ahora";
  if (n >= 50) return "bastante escuchada ahora";
  if (n >= 30) return "popularidad media ahora";
  return "nicho / baja en este momento";
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type CatalogOtherRelease = {
  album: string;
  album_type_es: string;
  release_year: number | null;
};

/** Ficha pública de Spotify. No hay conteo oficial de streams; popularity 0–100. */
export async function getCatalogTrackFacts(spotifyTrackId: string): Promise<{
  name: string;
  artists: string[];
  duration: string;
  duration_ms: number;
  popularity: number | null;
  popularity_label: string | null;
  explicit: boolean;
  track_number: number | null;
  disc_number: number | null;
  isrc: string | null;
  spotify_url: string | null;
  context_es: string;
  streams_note: string;
  album: {
    name: string;
    album_type: string | null;
    album_type_es: string;
    release_date: string | null;
    release_date_precision: string | null;
    release_year: number | null;
    total_tracks: number | null;
    label: string | null;
    copyrights: string[];
    popularity: number | null;
    is_single: boolean;
  } | null;
  artist: {
    name: string;
    followers: number | null;
    genres: string[];
    popularity: number | null;
  } | null;
  other_releases: CatalogOtherRelease[];
} | null> {
  const id = spotifyTrackId.trim();
  if (!id) return null;

  const trackRes = await spotifyFetch(`/tracks/${encodeURIComponent(id)}`);
  const track = await readJson(trackRes);
  if (!track) return null;

  const albumObj = (track.album ?? null) as Record<string, unknown> | null;
  const artistList = Array.isArray(track.artists) ? track.artists : [];
  const artistNames = artistList
    .map((a) =>
      a && typeof a === "object" ? String((a as { name?: string }).name ?? "") : "",
    )
    .filter(Boolean);
  const albumId =
    albumObj && typeof albumObj.id === "string" ? albumObj.id : null;
  const artistId =
    artistList[0] && typeof artistList[0] === "object"
      ? String((artistList[0] as { id?: string }).id ?? "")
      : "";
  const isrc =
    track.external_ids && typeof track.external_ids === "object"
      ? String((track.external_ids as { isrc?: string }).isrc ?? "") || null
      : null;

  const [albumRes, artistRes, isrcRes] = await Promise.all([
    albumId
      ? spotifyFetch(`/albums/${encodeURIComponent(albumId)}`)
      : Promise.resolve(null),
    artistId
      ? spotifyFetch(`/artists/${encodeURIComponent(artistId)}`)
      : Promise.resolve(null),
    isrc
      ? spotifyFetch(
          `/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=8`,
        )
      : Promise.resolve(null),
  ]);

  const albumJson = albumRes ? await readJson(albumRes) : albumObj;
  const artistJson = artistRes ? await readJson(artistRes) : null;
  const isrcJson = isrcRes ? await readJson(isrcRes) : null;
  const release =
    (typeof albumJson?.release_date === "string"
      ? albumJson.release_date
      : typeof albumObj?.release_date === "string"
        ? albumObj.release_date
        : null) ?? null;
  const albumType =
    (typeof albumJson?.album_type === "string"
      ? albumJson.album_type
      : typeof albumObj?.album_type === "string"
        ? albumObj.album_type
        : null) ?? null;
  const followersObj =
    artistJson?.followers && typeof artistJson.followers === "object"
      ? (artistJson.followers as { total?: number })
      : null;
  const trackNumber =
    typeof track.track_number === "number" ? track.track_number : null;
  const totalTracks =
    typeof albumJson?.total_tracks === "number"
      ? albumJson.total_tracks
      : typeof albumObj?.total_tracks === "number"
        ? albumObj.total_tracks
        : null;
  const albumName = String(albumJson?.name ?? albumObj?.name ?? "");
  const albumTypeLabel = albumTypeEs(albumType);
  const releaseYear = release ? Number(release.slice(0, 4)) || null : null;
  const popularity =
    typeof track.popularity === "number" ? track.popularity : null;
  const durationMs = Number(track.duration_ms ?? 0);

  const copyrights: string[] = [];
  if (Array.isArray(albumJson?.copyrights)) {
    for (const c of albumJson.copyrights) {
      if (c && typeof c === "object") {
        const text = String((c as { text?: string }).text ?? "").trim();
        if (text) copyrights.push(text);
      }
    }
  }

  const otherReleases: CatalogOtherRelease[] = [];
  const seenAlbums = new Set<string>(albumId ? [albumId] : []);
  const searchTracks =
    isrcJson?.tracks && typeof isrcJson.tracks === "object"
      ? (isrcJson.tracks as { items?: unknown[] }).items
      : null;
  if (Array.isArray(searchTracks)) {
    for (const item of searchTracks) {
      if (!item || typeof item !== "object") continue;
      const rec = item as {
        album?: { id?: string; name?: string; album_type?: string; release_date?: string };
      };
      const otherAlbum = rec.album;
      const otherId = otherAlbum?.id;
      if (!otherId || seenAlbums.has(otherId)) continue;
      seenAlbums.add(otherId);
      const otherRelease = otherAlbum.release_date ?? null;
      otherReleases.push({
        album: String(otherAlbum.name ?? ""),
        album_type_es: albumTypeEs(otherAlbum.album_type),
        release_year: otherRelease
          ? Number(otherRelease.slice(0, 4)) || null
          : null,
      });
    }
  }

  const isSingle = (albumType ?? "").toLowerCase() === "single";
  const pistaBit =
    trackNumber && totalTracks
      ? `, pista ${trackNumber} de ${totalTracks}`
      : trackNumber
        ? `, pista ${trackNumber}`
        : "";
  const releaseBit =
    release && release.length >= 10
      ? `Salió el ${release}`
      : releaseYear
        ? `Salió en ${releaseYear}`
        : "";
  let contextEs = "";
  if (isSingle) {
    contextEs = releaseBit
      ? `${releaseBit} como single`
      : "Salió como single";
    if (totalTracks && totalTracks > 1) {
      contextEs += ` (${totalTracks} pistas)`;
    }
  } else if (albumName) {
    const albumBit = `el ${albumTypeLabel} «${albumName}»${pistaBit}`;
    contextEs = releaseBit
      ? `${releaseBit} en ${albumBit}`
      : `Forma parte de ${albumBit}`;
  } else {
    contextEs = releaseBit;
  }
  if (otherReleases.length) {
    const extra = otherReleases
      .slice(0, 3)
      .map((r) =>
        r.release_year ? `${r.album} (${r.release_year})` : r.album,
      )
      .join("; ");
    contextEs = contextEs
      ? `${contextEs}. También aparece en: ${extra}`
      : `También aparece en: ${extra}`;
  }
  if (contextEs && !contextEs.endsWith(".")) contextEs += ".";

  return {
    name: String(track.name ?? ""),
    artists: artistNames,
    duration: formatDuration(durationMs),
    duration_ms: durationMs,
    popularity,
    popularity_label: popularityLabel(popularity),
    explicit: Boolean(track.explicit),
    track_number: trackNumber,
    disc_number:
      typeof track.disc_number === "number" ? track.disc_number : null,
    isrc,
    spotify_url:
      track.external_urls && typeof track.external_urls === "object"
        ? String((track.external_urls as { spotify?: string }).spotify ?? "") ||
          null
        : null,
    context_es: contextEs,
    streams_note:
      "Spotify no publica el número exacto de reproducciones por API. Di popularity (0–100) y popularity_label. NUNCA inventes millones de streams.",
    album: albumJson
      ? {
          name: albumName,
          album_type: albumType,
          album_type_es: albumTypeLabel,
          release_date: release,
          release_date_precision:
            typeof albumJson.release_date_precision === "string"
              ? albumJson.release_date_precision
              : null,
          release_year: releaseYear,
          total_tracks: totalTracks,
          label: typeof albumJson.label === "string" ? albumJson.label : null,
          copyrights: copyrights.slice(0, 3),
          popularity:
            typeof albumJson.popularity === "number"
              ? albumJson.popularity
              : null,
          is_single: isSingle,
        }
      : null,
    artist: artistJson
      ? {
          name: String(artistJson.name ?? artistNames[0] ?? ""),
          followers:
            typeof followersObj?.total === "number" ? followersObj.total : null,
          genres: Array.isArray(artistJson.genres)
            ? artistJson.genres.map((g) => String(g)).slice(0, 8)
            : [],
          popularity:
            typeof artistJson.popularity === "number"
              ? artistJson.popularity
              : null,
        }
      : null,
    other_releases: otherReleases.slice(0, 5),
  };
}
