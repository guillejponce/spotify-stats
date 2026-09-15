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
      | "RESTRICTED"
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
  let reason = "";
  let message = body;
  try {
    const json = JSON.parse(body) as {
      error?: { reason?: string; message?: string; status?: number };
    };
    reason = (json.error?.reason ?? "").toLowerCase();
    message = json.error?.message || body;
  } catch {
    /* texto plano */
  }
  const blob = `${lower} ${reason} ${message.toLowerCase()}`;

  if (res.status === 404 || blob.includes("no active device")) {
    throw new SpotifyPlayerError(
      "No hay un dispositivo de Spotify activo. Abre la app en el teléfono o la computadora y dale play una vez.",
      404,
      "NO_DEVICE",
    );
  }
  if (
    res.status === 403 &&
    (blob.includes("premium") || reason === "premium_required")
  ) {
    throw new SpotifyPlayerError(
      "Spotify Premium es necesario para controlar la reproducción.",
      403,
      "PREMIUM",
    );
  }
  if (
    res.status === 403 &&
    (blob.includes("insufficient") || blob.includes("scope"))
  ) {
    throw new SpotifyPlayerError(
      "La sesión de Spotify no tiene permiso de reproducción. Entrá a Conectar Spotify otra vez y aceptá los permisos.",
      403,
      "FORBIDDEN",
    );
  }
  if (
    res.status === 403 &&
    (blob.includes("restriction") || reason.includes("restriction"))
  ) {
    throw new SpotifyPlayerError(
      "Spotify rechazó el comando en este dispositivo. Abrí Spotify, dale play una vez (no en privado/DJ) y reintentá.",
      403,
      "RESTRICTED",
    );
  }
  if (res.status === 403) {
    throw new SpotifyPlayerError(
      message.slice(0, 180) ||
        "Spotify rechazó el control. Abrí la app, dale play una vez o reconectá la cuenta.",
      403,
      "RESTRICTED",
    );
  }
  throw new SpotifyPlayerError(
    `Spotify ${res.status}: ${message.slice(0, 180) || res.statusText}`,
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

export type PlaybackDevice = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

export type CatalogTrack = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  album_type: string | null;
  release_year: number | null;
  popularity: number | null;
};

export function toTrackUri(raw: string): string | null {
  const s = raw.trim();
  const uri = s.match(/^spotify:track:([a-zA-Z0-9]{22})$/);
  if (uri) return s;
  const open = s.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/);
  if (open) return `spotify:track:${open[1]}`;
  if (/^[a-zA-Z0-9]{22}$/.test(s) && !s.includes(":")) return `spotify:track:${s}`;
  return null;
}

export function toArtistUri(raw: string): string | null {
  const s = raw.trim();
  const uri = s.match(/^spotify:artist:([a-zA-Z0-9]{22})$/);
  if (uri) return s;
  const open = s.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]{22})/);
  if (open) return `spotify:artist:${open[1]}`;
  return null;
}

export function toAlbumUri(raw: string): string | null {
  const s = raw.trim();
  const uri = s.match(/^spotify:album:([a-zA-Z0-9]{22})$/);
  if (uri) return s;
  const open = s.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]{22})/);
  if (open) return `spotify:album:${open[1]}`;
  return null;
}

export async function listPlaybackDevices(): Promise<PlaybackDevice[]> {
  const res = await spotifyFetch("/me/player/devices");
  const json = await readJson(res);
  const devices = Array.isArray(json?.devices) ? json.devices : [];
  return devices
    .map((d) => {
      if (!d || typeof d !== "object") return null;
      const rec = d as {
        id?: string;
        name?: string;
        type?: string;
        is_active?: boolean;
      };
      if (!rec.id) return null;
      return {
        id: rec.id,
        name: rec.name || "Dispositivo",
        type: rec.type || "",
        is_active: Boolean(rec.is_active),
      };
    })
    .filter((d): d is PlaybackDevice => d != null);
}

async function pickPlaybackDevice(preferred?: string): Promise<string> {
  if (preferred?.trim()) return preferred.trim();
  const devices = await listPlaybackDevices();
  const active = devices.find((d) => d.is_active) ?? devices[0];
  if (!active) {
    throw new SpotifyPlayerError(
      "No hay un dispositivo de Spotify activo. Abre la app en el teléfono o la computadora y dale play una vez.",
      404,
      "NO_DEVICE",
    );
  }
  return active.id;
}

async function activateDevice(deviceId: string): Promise<void> {
  const res = await spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  if (res.status === 204 || res.ok) return;
  const body = res.status === 204 ? "" : await res.text();
  if (res.status === 404) return;
  throwIfPlayerFailed(res, body);
}

export async function startPlayingUris(
  uris: string[],
  deviceId?: string,
): Promise<void> {
  const clean = uris.filter(Boolean).slice(0, 20);
  if (!clean.length) {
    throw new SpotifyPlayerError("No hay canciones para reproducir", 400, "SPOTIFY");
  }
  const device = await pickPlaybackDevice(deviceId);
  const tryPlay = async () => {
    const res = await spotifyFetch(
      `/me/player/play?device_id=${encodeURIComponent(device)}`,
      {
        method: "PUT",
        body: JSON.stringify({ uris: clean, offset: { position: 0 } }),
      },
    );
    const body = res.status === 204 ? "" : await res.text();
    throwIfPlayerFailed(res, body);
  };
  try {
    await tryPlay();
  } catch (err) {
    if (err instanceof SpotifyPlayerError && err.code === "RESTRICTED") {
      await activateDevice(device);
      await tryPlay();
      return;
    }
    throw err;
  }
}

export async function startPlayingContext(
  contextUri: string,
  deviceId?: string,
): Promise<void> {
  const device = await pickPlaybackDevice(deviceId);
  const tryPlay = async () => {
    const res = await spotifyFetch(
      `/me/player/play?device_id=${encodeURIComponent(device)}`,
      {
        method: "PUT",
        body: JSON.stringify({ context_uri: contextUri }),
      },
    );
    const body = res.status === 204 ? "" : await res.text();
    throwIfPlayerFailed(res, body);
  };
  try {
    await tryPlay();
  } catch (err) {
    if (err instanceof SpotifyPlayerError && err.code === "RESTRICTED") {
      await activateDevice(device);
      await tryPlay();
      return;
    }
    throw err;
  }
}

export async function getArtistTopTrackUris(artistId: string): Promise<string[]> {
  const res = await spotifyFetch(
    `/artists/${encodeURIComponent(artistId)}/top-tracks?market=from_token`,
  );
  const json = await readJson(res);
  const tracks = Array.isArray(json?.tracks) ? json.tracks : [];
  const uris: string[] = [];
  for (const t of tracks) {
    if (!t || typeof t !== "object") continue;
    const uri = (t as { uri?: string }).uri;
    if (uri) uris.push(uri);
  }
  return uris.slice(0, 10);
}

export async function searchSpotifyArtist(
  query: string,
): Promise<{ id: string; name: string; uri: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const res = await spotifyFetch(
    `/search?q=${encodeURIComponent(q)}&type=artist&limit=5`,
  );
  const json = await readJson(res);
  const items =
    json?.artists && typeof json.artists === "object"
      ? (json.artists as { items?: { id?: string; name?: string; uri?: string }[] })
          .items
      : null;
  if (!Array.isArray(items) || !items.length) return null;
  const lower = q.toLowerCase();
  const hit =
    items.find((a) => (a.name ?? "").toLowerCase() === lower) ?? items[0];
  if (!hit?.id || !hit.name) return null;
  return {
    id: hit.id,
    name: hit.name,
    uri: hit.uri || `spotify:artist:${hit.id}`,
  };
}

export async function addUrisToQueue(uris: string[]): Promise<void> {
  const clean = uris.filter(Boolean).slice(0, 20);
  if (!clean.length) {
    throw new SpotifyPlayerError("No hay canciones para la cola", 400, "SPOTIFY");
  }
  const device = await pickPlaybackDevice();
  for (const uri of clean) {
    const res = await spotifyFetch(
      `/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${encodeURIComponent(device)}`,
      { method: "POST" },
    );
    const body = res.status === 204 ? "" : await res.text();
    throwIfPlayerFailed(res, body);
  }
}

export async function searchSpotifyTracks(
  query: string,
  limit = 5,
): Promise<CatalogTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await spotifyFetch(
    `/search?q=${encodeURIComponent(q)}&type=track&limit=${Math.max(1, Math.min(10, limit))}`,
  );
  const json = await readJson(res);
  const items =
    json?.tracks && typeof json.tracks === "object"
      ? (json.tracks as { items?: unknown[] }).items
      : null;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => mapCatalogSearchItem(item))
    .filter((t): t is CatalogTrack => t != null);
}

function mapCatalogSearchItem(item: unknown): CatalogTrack | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as SpotifyItem & { popularity?: number };
  if (!rec.id || !rec.name || !rec.uri) return null;
  const mapped = mapItem(rec);
  if (!mapped) return null;
  return {
    id: rec.id,
    uri: rec.uri,
    name: mapped.name,
    artist: mapped.artist,
    album: mapped.album ?? "",
    album_type: mapped.album_type,
    release_year: mapped.release_date
      ? Number(mapped.release_date.slice(0, 4)) || null
      : null,
    popularity: mapped.popularity,
  };
}

export async function resolveTrackQueries(
  queries: string[],
): Promise<{
  resolved: CatalogTrack[];
  missing: string[];
}> {
  const unique = Array.from(
    new Set(queries.map((q) => q.trim()).filter(Boolean)),
  ).slice(0, 15);

  const results = await Promise.all(
    unique.map(async (query) => {
      const uri = toTrackUri(query);
      if (uri) {
        const id = uri.slice("spotify:track:".length);
        const res = await spotifyFetch(`/tracks/${encodeURIComponent(id)}`);
        const json = await readJson(res);
        return { query, track: mapCatalogSearchItem(json) };
      }
      const hits = await searchSpotifyTracks(query, 3);
      return { query, track: hits[0] ?? null };
    }),
  );

  const resolved: CatalogTrack[] = [];
  const missing: string[] = [];
  for (const row of results) {
    if (row.track) resolved.push(row.track);
    else missing.push(row.query);
  }
  return { resolved, missing };
}

export async function fetchArtistDiscographyTracks(
  artistQuery: string,
): Promise<{ artist: { id: string; name: string }; tracks: CatalogTrack[] } | null> {
  const q = artistQuery.trim();
  if (!q) return null;
  const searchRes = await spotifyFetch(
    `/search?q=${encodeURIComponent(q)}&type=artist&limit=5`,
  );
  const searchJson = await readJson(searchRes);
  const artists =
    searchJson?.artists && typeof searchJson.artists === "object"
      ? (searchJson.artists as { items?: { id?: string; name?: string }[] }).items
      : null;
  if (!Array.isArray(artists) || !artists.length) return null;

  const lower = q.toLowerCase();
  const artist =
    artists.find((a) => (a.name ?? "").toLowerCase() === lower) ?? artists[0];
  if (!artist?.id || !artist.name) return null;
  const artistId = artist.id;
  const artistName = artist.name;

  type AlbumLite = {
    id: string;
    name: string;
    album_type: string | null;
    release_date: string | null;
  };
  const albums: AlbumLite[] = [];
  let offset = 0;
  for (let page = 0; page < 6; page++) {
    const albumRes = await spotifyFetch(
      `/artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single&limit=50&offset=${offset}&market=from_token`,
    );
    const albumJson = await readJson(albumRes);
    const items = Array.isArray(albumJson?.items) ? albumJson.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as {
        id?: string;
        name?: string;
        album_type?: string;
        release_date?: string;
      };
      if (!rec.id) continue;
      albums.push({
        id: rec.id,
        name: rec.name ?? "",
        album_type: rec.album_type ?? null,
        release_date: rec.release_date ?? null,
      });
    }
    const total = typeof albumJson?.total === "number" ? albumJson.total : items.length;
    offset += items.length;
    if (!items.length || offset >= total) break;
  }

  const byId = new Map<string, AlbumLite>();
  for (const album of albums) byId.set(album.id, album);
  const albumList = Array.from(byId.values());

  type TrackSeed = {
    id: string;
    uri: string;
    name: string;
    artist: string;
    album: AlbumLite;
  };
  const seeds: TrackSeed[] = [];
  const albumChunks: AlbumLite[][] = [];
  for (let i = 0; i < albumList.length; i += 20) {
    albumChunks.push(albumList.slice(i, i + 20));
  }
  const albumJsons = await Promise.all(
    albumChunks.map(async (chunk) => {
      const res = await spotifyFetch(
        `/albums?ids=${encodeURIComponent(chunk.map((a) => a.id).join(","))}&market=from_token`,
      );
      return readJson(res);
    }),
  );
  for (const json of albumJsons) {
    const albumRows = Array.isArray(json?.albums) ? json.albums : [];
    for (const row of albumRows) {
      if (!row || typeof row !== "object") continue;
      const albumRec = row as {
        id?: string;
        name?: string;
        album_type?: string;
        release_date?: string;
        tracks?: { items?: unknown[]; total?: number };
      };
      const albumMeta: AlbumLite = {
        id: albumRec.id || "",
        name: albumRec.name ?? "",
        album_type: albumRec.album_type ?? null,
        release_date: albumRec.release_date ?? null,
      };
      const trackItems = Array.isArray(albumRec.tracks?.items)
        ? albumRec.tracks.items
        : [];
      for (const t of trackItems) {
        if (!t || typeof t !== "object") continue;
        const tr = t as {
          id?: string;
          uri?: string;
          name?: string;
          artists?: { name?: string }[];
        };
        if (!tr.id || !tr.uri || !tr.name) continue;
        seeds.push({
          id: tr.id,
          uri: tr.uri,
          name: tr.name,
          artist: (tr.artists ?? [])
            .map((a) => a.name)
            .filter(Boolean)
            .join(", "),
          album: albumMeta,
        });
      }
    }
  }

  const unique = new Map<string, TrackSeed>();
  for (const seed of seeds) {
    if (!unique.has(seed.id)) unique.set(seed.id, seed);
  }

  const tracks: CatalogTrack[] = Array.from(unique.values()).map((seed) => ({
    id: seed.id,
    uri: seed.uri,
    name: seed.name,
    artist: seed.artist || artistName,
    album: seed.album.name,
    album_type: seed.album.album_type,
    release_year: seed.album.release_date
      ? Number(seed.album.release_date.slice(0, 4)) || null
      : null,
    popularity: null,
  }));

  return { artist: { id: artistId, name: artistName }, tracks };
}

export async function hydrateCatalogPopularity(
  tracks: CatalogTrack[],
): Promise<CatalogTrack[]> {
  if (!tracks.length) return tracks;
  const popularity = new Map<string, number>();
  const chunks: string[][] = [];
  for (let i = 0; i < tracks.length; i += 50) {
    chunks.push(tracks.slice(i, i + 50).map((t) => t.id));
  }
  const jsons = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await spotifyFetch(
        `/tracks?ids=${encodeURIComponent(chunk.join(","))}&market=from_token`,
      );
      return readJson(res);
    }),
  );
  for (const json of jsons) {
    const rows = Array.isArray(json?.tracks) ? json.tracks : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { id?: string; popularity?: number };
      if (rec.id && typeof rec.popularity === "number") {
        popularity.set(rec.id, rec.popularity);
      }
    }
  }
  return tracks.map((t) => ({
    ...t,
    popularity: popularity.get(t.id) ?? t.popularity,
  }));
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
