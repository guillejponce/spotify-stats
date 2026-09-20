import {
  formatPitchKey,
  getSpotifyClientCredentialsToken,
  getSpotifyTrackPreviewUrl,
  probeSpotifyTrackAudioMeta,
  type SpotifyAudioProbe,
  type SpotifyTrackAudioMeta,
} from "@/lib/spotify";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSpotifyAccessToken } from "@/lib/spotify-token";

export type TrackHarmony = {
  key: string | null;
  tempo: number | null;
  debug: HarmonyDebug;
};

export type HarmonyDebug = {
  spotifyTrackId: string | null;
  token: "user" | "cc" | "none";
  featuresStatus: number | null;
  analysisStatus: number | null;
  recco: "hit" | "miss" | "error";
  preview: boolean;
  source: "spotify" | "recco" | "preview" | null;
};

const HIT_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 45 * 1000;
const cache = new Map<string, { at: number; value: TrackHarmony }>();
const inflight = new Map<string, Promise<TrackHarmony>>();

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const RECCO_FEATURES_URL = "https://api.reccobeats.com/v1/audio-features";
const RECCO_ANALYZE_URL = "https://api.reccobeats.com/v1/analysis/audio-features";

function looksLikeSpotifyId(id: string): boolean {
  return SPOTIFY_ID.test(id);
}

function emptyMeta(): SpotifyTrackAudioMeta {
  return { tempo: null, key: null };
}

function hasAny(meta: SpotifyTrackAudioMeta): boolean {
  return meta.tempo != null || meta.key != null;
}

function mergeMeta(
  primary: SpotifyTrackAudioMeta,
  fallback: SpotifyTrackAudioMeta,
): SpotifyTrackAudioMeta {
  return {
    key: primary.key ?? fallback.key,
    tempo: primary.tempo ?? fallback.tempo,
  };
}

function parseReccoMeta(json: unknown): SpotifyTrackAudioMeta {
  const root = json as {
    content?: Array<{ tempo?: number; key?: number; mode?: number }>;
    tempo?: number;
    key?: number;
    mode?: number;
  };
  const row = Array.isArray(root.content) ? root.content[0] : root;
  if (!row || typeof row !== "object") return emptyMeta();
  const t = row.tempo;
  const tempo =
    typeof t === "number" && Number.isFinite(t) && t >= 40 && t <= 240
      ? Math.round(t)
      : null;
  return { tempo, key: formatPitchKey(row.key, row.mode) };
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

async function resolveAccessToken(
  explicit: string | null,
): Promise<{ token: string | null; kind: "user" | "cc" | "none" }> {
  if (explicit) return { token: explicit, kind: "user" };
  try {
    const supabase = createServerSupabaseClient();
    const user = await getSpotifyAccessToken(supabase);
    if (user) return { token: user, kind: "user" };
  } catch {
    /* ignore */
  }
  const cc = await getSpotifyClientCredentialsToken();
  if (cc) return { token: cc, kind: "cc" };
  return { token: null, kind: "none" };
}

async function readSpotifyMeta(
  accessToken: string | null,
  spotifyTrackId: string,
): Promise<SpotifyAudioProbe> {
  const empty: SpotifyAudioProbe = {
    tempo: null,
    key: null,
    featuresStatus: null,
    analysisStatus: null,
  };
  if (!accessToken) return empty;
  try {
    return await probeSpotifyTrackAudioMeta(accessToken, spotifyTrackId);
  } catch (e) {
    if (e instanceof Error && e.message === "EXPIRED_TOKEN") {
      const cc = await getSpotifyClientCredentialsToken();
      if (!cc) return { ...empty, featuresStatus: 401 };
      try {
        return await probeSpotifyTrackAudioMeta(cc, spotifyTrackId);
      } catch {
        return { ...empty, featuresStatus: 401 };
      }
    }
    return empty;
  }
}

async function readReccoCatalog(spotifyTrackId: string): Promise<SpotifyTrackAudioMeta> {
  try {
    const url = `${RECCO_FEATURES_URL}?ids=${encodeURIComponent(spotifyTrackId)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return emptyMeta();
    return parseReccoMeta(await res.json());
  } catch {
    return emptyMeta();
  }
}

async function analyzePreviewTempo(previewUrl: string): Promise<number | null> {
  try {
    const audio = await fetch(previewUrl, { signal: AbortSignal.timeout(8000) });
    if (!audio.ok) return null;
    const buf = await audio.arrayBuffer();
    if (buf.byteLength < 1000 || buf.byteLength > 5 * 1024 * 1024) return null;
    const form = new FormData();
    form.append(
      "audioFile",
      new Blob([buf], { type: "audio/mpeg" }),
      "preview.mp3",
    );
    const res = await fetch(RECCO_ANALYZE_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const meta = parseReccoMeta(await res.json());
    return meta.tempo;
  } catch {
    return null;
  }
}

async function resolvePreviewUrl(
  accessToken: string | null,
  spotifyTrackId: string,
  explicit: string | null,
): Promise<string | null> {
  if (explicit) return explicit;
  if (!accessToken) return null;
  try {
    return await getSpotifyTrackPreviewUrl(accessToken, spotifyTrackId);
  } catch {
    return null;
  }
}

export async function getTrackHarmony(input: {
  accessToken?: string | null;
  spotifyTrackId?: string | null;
  dbTrackId?: string | null;
  previewUrl?: string | null;
  bypassCache?: boolean;
}): Promise<TrackHarmony> {
  const dbTrackId = input.dbTrackId?.trim() || null;
  let spotifyTrackId = input.spotifyTrackId?.trim() || null;
  if (!spotifyTrackId && dbTrackId) {
    spotifyTrackId = await resolveSpotifyTrackId(dbTrackId);
  }
  const previewUrl = input.previewUrl?.trim() || null;

  const cacheKey = `${spotifyTrackId ?? ""}:${dbTrackId ?? ""}`;
  if (!input.bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      const ttl = hasAny(hit.value) ? HIT_TTL_MS : MISS_TTL_MS;
      if (Date.now() - hit.at < ttl) return hit.value;
    }
  }

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const job = (async () => {
    const auth = await resolveAccessToken(input.accessToken ?? null);
    const emptyProbe: SpotifyAudioProbe = {
      tempo: null,
      key: null,
      featuresStatus: auth.kind === "none" ? null : null,
      analysisStatus: null,
    };
    const [spotify, recco] = await Promise.all([
      spotifyTrackId ? readSpotifyMeta(auth.token, spotifyTrackId) : emptyProbe,
      spotifyTrackId ? readReccoCatalog(spotifyTrackId) : emptyMeta(),
    ]);

    let source: HarmonyDebug["source"] = null;
    let measured: SpotifyTrackAudioMeta = emptyMeta();
    if (hasAny(spotify)) {
      measured = { key: spotify.key, tempo: spotify.tempo };
      source = "spotify";
    }
    if (!hasAny(measured) && hasAny(recco)) {
      measured = recco;
      source = "recco";
    } else if (source === "spotify") {
      measured = mergeMeta(measured, recco);
    }

    const preview =
      measured.tempo == null && spotifyTrackId
        ? await resolvePreviewUrl(auth.token, spotifyTrackId, previewUrl)
        : null;
    if (measured.tempo == null && preview) {
      const tempo = await analyzePreviewTempo(preview);
      if (tempo != null) {
        measured = { ...measured, tempo };
        if (!source) source = "preview";
      }
    }

    const debug: HarmonyDebug = {
      spotifyTrackId,
      token: auth.kind,
      featuresStatus: spotify.featuresStatus,
      analysisStatus: spotify.analysisStatus,
      recco: hasAny(recco) ? "hit" : "miss",
      preview: Boolean(preview),
      source,
    };

    console.info(
      "[harmony]",
      JSON.stringify({
        ...debug,
        key: measured.key,
        tempo: measured.tempo,
      }),
    );

    const value: TrackHarmony = {
      key: measured.key,
      tempo: measured.tempo,
      debug,
    };
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  })();

  inflight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(cacheKey);
  }
}
