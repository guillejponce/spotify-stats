import type { SupabaseClient } from "@supabase/supabase-js";
import { getSpotifyClientCredentialsToken } from "@/lib/spotify";
import { persistSpotifyTrackGraph, type PersistedTrack } from "@/lib/spotify-track-graph";

const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Quita tildes, "(Remastered 2011)", "- Live", "feat." y signos para comparar nombres. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s[-–]\s.*(remaster|version|edit|mix|live|mono|stereo|deluxe).*$/i, "")
    .replace(/[([][^)\]]*(remaster|version|edit|feat|with|live|mono|stereo|deluxe|bonus)[^)\]]*[)\]]/gi, "")
    .replace(/\b(feat|ft|featuring)\b.*$/i, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchKey(artist: string, track: string): string {
  return `${normalizeName(artist)}|${normalizeName(track)}`;
}

type SpotifySearchTrack = Record<string, unknown> & {
  name?: string;
  artists?: { name?: string }[];
  popularity?: number;
};

async function searchCatalog(query: string): Promise<SpotifySearchTrack[]> {
  const token = await getSpotifyClientCredentialsToken();
  if (!token) throw new Error("Sin credenciales de Spotify para buscar canciones");
  const res = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({ q: query, type: "track", limit: "8" })}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (res.status === 429) throw new Error("Spotify limitó las búsquedas (429)");
  if (!res.ok) return [];
  const json = (await res.json()) as { tracks?: { items?: SpotifySearchTrack[] } };
  return json.tracks?.items ?? [];
}

function pickBest(items: SpotifySearchTrack[], artist: string, track: string): SpotifySearchTrack | null {
  const wantArtist = normalizeName(artist);
  const wantTrack = normalizeName(track);
  let best: { item: SpotifySearchTrack; score: number } | null = null;
  for (const item of items) {
    const artists = (item.artists ?? []).map((a) => normalizeName(a.name ?? ""));
    const artistOk = artists.some((a) => a === wantArtist || a.includes(wantArtist) || wantArtist.includes(a));
    if (!artistOk) continue;
    const name = normalizeName(item.name ?? "");
    let score: number;
    if (name === wantTrack) score = 3;
    else if (name.startsWith(wantTrack) || wantTrack.startsWith(name)) score = 2;
    else continue;
    if (artists[0] === wantArtist) score += 0.5;
    score += (item.popularity ?? 0) / 1000;
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

async function loadTrack(db: SupabaseClient, trackId: string): Promise<PersistedTrack | null> {
  const { data } = await db
    .from("tracks")
    .select("id, artist_id, album_id, duration_ms")
    .eq("id", trackId)
    .maybeSingle();
  if (!data?.artist_id) return null;
  return {
    trackId: data.id as string,
    artistId: data.artist_id as string,
    albumId: (data.album_id as string | null) ?? null,
    durationMs: Number(data.duration_ms) || 0,
  };
}

/**
 * Canción del catálogo para un scrobble. Usa la tabla compartida de
 * equivalencias; si no está, busca en Spotify con el token de la app.
 * `cache` evita repetir búsquedas dentro de una misma corrida.
 */
export async function resolveScrobbleTrack(
  db: SupabaseClient,
  artist: string,
  track: string,
  cache: Map<string, PersistedTrack | null>
): Promise<PersistedTrack | null> {
  const key = matchKey(artist, track);
  if (cache.has(key)) return cache.get(key)!;

  const { data: mapped } = await db
    .from("lastfm_track_map")
    .select("track_id, retry_after")
    .eq("match_key", key)
    .maybeSingle();

  if (mapped?.track_id) {
    const hit = await loadTrack(db, mapped.track_id as string);
    if (hit) {
      cache.set(key, hit);
      return hit;
    }
  } else if (mapped?.retry_after && new Date(mapped.retry_after as string).getTime() > Date.now()) {
    cache.set(key, null);
    return null;
  }

  let found = pickBest(await searchCatalog(`track:${track} artist:${artist}`), artist, track);
  if (!found) found = pickBest(await searchCatalog(`${artist} ${track}`), artist, track);

  const persisted = found ? await persistSpotifyTrackGraph(db, found) : null;
  await db.from("lastfm_track_map").upsert({
    match_key: key,
    artist_name: artist,
    track_name: track,
    track_id: persisted?.trackId ?? null,
    searched_at: new Date().toISOString(),
    retry_after: persisted ? null : new Date(Date.now() + MISS_RETRY_MS).toISOString(),
  });

  cache.set(key, persisted);
  return persisted;
}
