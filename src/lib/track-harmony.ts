import { getSongChart } from "@/lib/charts";
import { parseChordPro } from "@/lib/chordpro";
import {
  getSpotifyClientCredentialsToken,
  getSpotifyTrackAudioMeta,
  type SpotifyTrackAudioMeta,
} from "@/lib/spotify";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSpotifyAccessToken } from "@/lib/spotify-token";

export type TrackHarmony = {
  key: string | null;
  tempo: number | null;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: TrackHarmony }>();

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

function looksLikeSpotifyId(id: string): boolean {
  return SPOTIFY_ID.test(id);
}

function isGuessedChart(content: string): boolean {
  return /esqueleto tentativo/i.test(content);
}

export async function resolveSpotifyTrackId(
  dbTrackId: string,
): Promise<string | null> {
  const id = dbTrackId.trim();
  if (!id) return null;
  if (looksLikeSpotifyId(id)) return id;

  const supabase = createServerSupabaseClient();
  const withSpotify = await supabase
    .from("tracks")
    .select("id, spotify_id")
    .eq("id", id)
    .maybeSingle();

  if (withSpotify.error && /spotify_id/i.test(withSpotify.error.message)) {
    const legacy = await supabase.from("tracks").select("id").eq("id", id).maybeSingle();
    const pk = legacy.data?.id ? String(legacy.data.id) : "";
    return looksLikeSpotifyId(pk) ? pk : null;
  }

  const sid = withSpotify.data?.spotify_id ? String(withSpotify.data.spotify_id) : "";
  if (looksLikeSpotifyId(sid)) return sid;
  const pk = withSpotify.data?.id ? String(withSpotify.data.id) : "";
  if (looksLikeSpotifyId(pk)) return pk;
  return null;
}

async function chartHarmony(dbTrackId: string | null): Promise<TrackHarmony> {
  if (!dbTrackId) return { key: null, tempo: null };
  try {
    const chart = await getSongChart(dbTrackId);
    if (!chart || isGuessedChart(chart.content)) return { key: null, tempo: null };
    const parsed = parseChordPro(chart.content);
    return {
      key: chart.original_key || parsed.key,
      tempo: parsed.tempo,
    };
  } catch {
    return { key: null, tempo: null };
  }
}

async function resolveAccessToken(explicit: string | null): Promise<string | null> {
  if (explicit) return explicit;
  try {
    const supabase = createServerSupabaseClient();
    const user = await getSpotifyAccessToken(supabase);
    if (user) return user;
  } catch {
    /* ignore */
  }
  return getSpotifyClientCredentialsToken();
}

async function spotifyHarmony(
  accessToken: string | null,
  spotifyTrackId: string | null,
): Promise<SpotifyTrackAudioMeta> {
  if (!spotifyTrackId) return { tempo: null, key: null };

  const read = async (bearer: string) => {
    try {
      return await getSpotifyTrackAudioMeta(bearer, spotifyTrackId);
    } catch (e) {
      if (e instanceof Error && e.message === "EXPIRED_TOKEN") throw e;
      return { tempo: null, key: null };
    }
  };

  if (accessToken) {
    try {
      const meta = await read(accessToken);
      if (meta.tempo != null || meta.key != null) return meta;
    } catch {
      /* user token expired or rejected; try client credentials */
    }
  }

  const cc = await getSpotifyClientCredentialsToken();
  if (!cc || cc === accessToken) return { tempo: null, key: null };
  try {
    return await read(cc);
  } catch {
    return { tempo: null, key: null };
  }
}

export async function getTrackHarmony(input: {
  accessToken?: string | null;
  spotifyTrackId?: string | null;
  dbTrackId?: string | null;
}): Promise<TrackHarmony> {
  const dbTrackId = input.dbTrackId?.trim() || null;
  let spotifyTrackId = input.spotifyTrackId?.trim() || null;
  if (!spotifyTrackId && dbTrackId) {
    spotifyTrackId = await resolveSpotifyTrackId(dbTrackId);
  }

  const key = `${spotifyTrackId ?? ""}:${dbTrackId ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const token = await resolveAccessToken(input.accessToken ?? null);
  const [chart, spotify] = await Promise.all([
    chartHarmony(dbTrackId),
    spotifyHarmony(token, spotifyTrackId),
  ]);

  const value: TrackHarmony = {
    key: spotify.key ?? chart.key,
    tempo: spotify.tempo ?? chart.tempo,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
