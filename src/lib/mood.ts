import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import { getSpotifyClientCredentialsToken } from "@/lib/spotify";
import { getSpotifyAccessToken } from "@/lib/spotify-token";
import type { UserCtx } from "@/lib/user-context";

export type MoodPeriod = "day" | "week" | "month" | "year";

export type MoodLabel =
  | "euphoric"
  | "energetic"
  | "intense"
  | "chill"
  | "melancholic"
  | "focused"
  | "balanced"
  | "no_data";

export interface MoodSnapshot {
  mood_label: MoodLabel;
  mood_intensity: number;
  avg_valence: number | null;
  avg_energy: number | null;
  avg_danceability: number | null;
  avg_acousticness: number | null;
  total_plays: number;
  unique_tracks: number;
  message?: string;
}

export interface MoodTimelinePoint extends MoodSnapshot {
  period_start: string;
  period_end: string;
}

export interface MoodRecommendation {
  track_id: string;
  track_name: string;
  artist_name: string;
  valence: number;
  energy: number;
  mood_match_score: number;
}

type Vec = { valence: number; energy: number; acousticness: number };

const GENRE_RULES: Array<{ re: RegExp; vec: Vec }> = [
  { re: /black metal|death metal|grindcore|hardcore|metalcore|industrial/, vec: { valence: 0.22, energy: 0.92, acousticness: 0.04 } },
  { re: /metal|punk|hard rock/, vec: { valence: 0.38, energy: 0.86, acousticness: 0.06 } },
  { re: /edm|house|techno|trance|drum and bass|dubstep|electro|dance/, vec: { valence: 0.72, energy: 0.9, acousticness: 0.03 } },
  { re: /reggaeton|latin|salsa|cumbia|funk|disco|k-pop|pop/, vec: { valence: 0.78, energy: 0.74, acousticness: 0.1 } },
  { re: /hip hop|hip-hop|rap|trap/, vec: { valence: 0.48, energy: 0.72, acousticness: 0.08 } },
  { re: /rock|alternative/, vec: { valence: 0.52, energy: 0.7, acousticness: 0.12 } },
  { re: /lo-fi|lofi|ambient|classical|piano|instrumental|study|soundtrack|score/, vec: { valence: 0.42, energy: 0.22, acousticness: 0.82 } },
  { re: /sad|emo|blues|post-rock|singer-songwriter/, vec: { valence: 0.24, energy: 0.32, acousticness: 0.55 } },
  { re: /jazz|soul|r&b|rnb|bossa|acoustic|folk|reggae|chill|bossanova/, vec: { valence: 0.62, energy: 0.34, acousticness: 0.58 } },
  { re: /indie/, vec: { valence: 0.46, energy: 0.48, acousticness: 0.32 } },
];

const TARGETS: Record<string, { valence: number; energy: number }> = {
  euphoric: { valence: 0.85, energy: 0.85 },
  energetic: { valence: 0.65, energy: 0.75 },
  party: { valence: 0.8, energy: 0.8 },
  chill: { valence: 0.65, energy: 0.35 },
  melancholic: { valence: 0.25, energy: 0.35 },
  intense: { valence: 0.3, energy: 0.88 },
  focused: { valence: 0.45, energy: 0.3 },
  balanced: { valence: 0.5, energy: 0.5 },
};

const NO_DATA =
  "No hay géneros en lo que escuchaste en este período, así que no puedo estimar el mood.";

function average(vecs: Vec[]): Vec {
  const n = vecs.length;
  return {
    valence: vecs.reduce((s, v) => s + v.valence, 0) / n,
    energy: vecs.reduce((s, v) => s + v.energy, 0) / n,
    acousticness: vecs.reduce((s, v) => s + v.acousticness, 0) / n,
  };
}

export function vectorForGenres(genres: string[] | null | undefined): Vec | null {
  if (!genres?.length) return null;
  const hits: Vec[] = [];
  for (const genre of genres) {
    const text = genre.toLowerCase();
    const rule = GENRE_RULES.find((item) => item.re.test(text));
    if (rule) hits.push(rule.vec);
  }
  if (hits.length) return average(hits);
  return { valence: 0.5, energy: 0.5, acousticness: 0.3 };
}

export function classifyMood(valence: number, energy: number, acousticness: number): MoodLabel {
  if (energy > 0.7 && valence > 0.7) return "euphoric";
  if (energy > 0.6 && valence > 0.5) return "energetic";
  if (energy > 0.7 && valence < 0.4) return "intense";
  if (energy < 0.5 && valence > 0.5) return "chill";
  if (energy < 0.5 && valence < 0.4) return "melancholic";
  if (acousticness > 0.6 && energy < 0.6) return "focused";
  return "balanced";
}

function intensity(valence: number, energy: number): number {
  return Math.min(1, Math.sqrt((valence - 0.5) ** 2 + (energy - 0.5) ** 2) / 0.707);
}

function emptySnapshot(totalPlays: number, message = NO_DATA): MoodSnapshot {
  return {
    mood_label: "no_data",
    mood_intensity: 0,
    avg_valence: null,
    avg_energy: null,
    avg_danceability: null,
    avg_acousticness: null,
    total_plays: totalPlays,
    unique_tracks: 0,
    message,
  };
}

type PlayRow = {
  played_at: string;
  ms_played: number;
  artist_id: string | null;
  track_id: string | null;
};

async function loadPlays(ctx: UserCtx, start: Date, end: Date): Promise<PlayRow[]> {
  const rows: PlayRow[] = [];
  const pageSize = 1000;
  const maxRows = 8000;

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await ctx.db
      .from("plays")
      .select("played_at, ms_played, artist_id, track_id")
      .eq("user_id", ctx.userId)
      .gte("played_at", start.toISOString())
      .lt("played_at", end.toISOString())
      .gte("ms_played", 30000)
      .order("played_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as PlayRow[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

type ArtistGenreRow = { name: string; genres: string[] | null };

async function artistsById(ctx: UserCtx, artistIds: string[]): Promise<Map<string, ArtistGenreRow>> {
  const map = new Map<string, ArtistGenreRow>();
  for (let i = 0; i < artistIds.length; i += 200) {
    const chunk = artistIds.slice(i, i + 200);
    const { data, error } = await ctx.db.from("artists").select("id, name, genres").in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      map.set(String(row.id), {
        name: String(row.name ?? ""),
        genres: Array.isArray(row.genres) ? (row.genres as string[]) : null,
      });
    }
  }
  return map;
}

async function attachArtists(ctx: UserCtx, plays: PlayRow[]): Promise<PlayRow[]> {
  const missingTrackIds = Array.from(
    new Set(
      plays
        .filter((play) => !play.artist_id && play.track_id)
        .map((play) => play.track_id as string),
    ),
  );
  if (!missingTrackIds.length) return plays;

  const artistByTrack = new Map<string, string>();
  for (let i = 0; i < missingTrackIds.length; i += 200) {
    const chunk = missingTrackIds.slice(i, i + 200);
    const { data, error } = await ctx.db.from("tracks").select("id, artist_id").in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.artist_id) artistByTrack.set(String(row.id), String(row.artist_id));
    }
  }

  return plays.map((play) => {
    if (play.artist_id || !play.track_id) return play;
    return { ...play, artist_id: artistByTrack.get(play.track_id) ?? null };
  });
}

async function searchArtistGenres(token: string, name: string): Promise<string[] | null> {
  const url = `https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    artists?: { items?: Array<{ name?: string; genres?: unknown }> };
  };
  const items = json.artists?.items ?? [];
  const exact =
    items.find((item) => item.name?.toLowerCase() === name.toLowerCase()) ?? items[0];
  if (!exact || !Array.isArray(exact.genres)) return null;
  return exact.genres.map((genre) => String(genre)).slice(0, 8);
}

async function fillMissingGenres(
  ctx: UserCtx,
  plays: PlayRow[],
  artists: Map<string, ArtistGenreRow>,
): Promise<Map<string, string[] | null>> {
  const weight = new Map<string, number>();
  for (const play of plays) {
    if (!play.artist_id) continue;
    weight.set(play.artist_id, (weight.get(play.artist_id) ?? 0) + (Number(play.ms_played) || 0));
  }

  const missing = Array.from(weight.entries())
    .filter(([id]) => {
      const row = artists.get(id);
      return row && row.genres == null && row.name.trim().length > 0;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([id]) => id);

  const genres = new Map<string, string[] | null>();
  for (const [id, row] of Array.from(artists.entries())) genres.set(id, row.genres);
  if (!missing.length) return genres;

  const token =
    (await getSpotifyClientCredentialsToken()) ?? (await getSpotifyAccessToken(ctx));
  if (!token) return genres;
  const bearer = token;

  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const id = missing[cursor];
      cursor += 1;
      const name = artists.get(id)?.name ?? "";
      try {
        const found = await searchArtistGenres(bearer, name);
        if (!found) continue;
        const { error } = await ctx.db.from("artists").update({ genres: found }).eq("id", id);
        if (!error) genres.set(id, found);
      } catch (error) {
        console.warn("[mood] genre lookup failed", name, error);
      }
    }
  }

  const workers = Math.min(4, missing.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return genres;
}

async function playsForMood(ctx: UserCtx, start: Date, end: Date) {
  const plays = await attachArtists(ctx, await loadPlays(ctx, start, end));
  const artistIds = Array.from(
    new Set(plays.map((play) => play.artist_id).filter((id): id is string => Boolean(id))),
  );
  const artists = await artistsById(ctx, artistIds);
  const genres = await fillMissingGenres(ctx, plays, artists);
  return { plays, genres };
}

function summarize(plays: PlayRow[], genres: Map<string, string[] | null>): MoodSnapshot {
  if (!plays.length) return emptySnapshot(0, "No hay reproducciones en este período.");

  let valence = 0;
  let energy = 0;
  let acousticness = 0;
  let weight = 0;
  const tracks = new Set<string>();

  for (const play of plays) {
    if (play.track_id) tracks.add(play.track_id);
    if (!play.artist_id) continue;
    const vec = vectorForGenres(genres.get(play.artist_id));
    if (!vec) continue;
    const ms = Math.max(Number(play.ms_played) || 0, 1);
    valence += vec.valence * ms;
    energy += vec.energy * ms;
    acousticness += vec.acousticness * ms;
    weight += ms;
  }

  if (weight === 0) return emptySnapshot(plays.length);

  const avgValence = valence / weight;
  const avgEnergy = energy / weight;
  const avgAcousticness = acousticness / weight;
  const label = classifyMood(avgValence, avgEnergy, avgAcousticness);

  return {
    mood_label: label,
    mood_intensity: intensity(avgValence, avgEnergy),
    avg_valence: avgValence,
    avg_energy: avgEnergy,
    avg_acousticness: avgAcousticness,
    avg_danceability: Math.min(1, avgEnergy * 0.55 + avgValence * 0.25 + (1 - avgAcousticness) * 0.2),
    total_plays: plays.length,
    unique_tracks: tracks.size,
  };
}

export function rollingRange(period: string, now = new Date()): { start: Date; end: Date } {
  const days = period === "day" ? 1 : period === "month" ? 30 : period === "year" ? 365 : 7;
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
}

export async function currentMood(ctx: UserCtx, period: string, now = new Date()): Promise<MoodSnapshot> {
  const { start, end } = rollingRange(period, now);
  const { plays, genres } = await playsForMood(ctx, start, end);
  return summarize(plays, genres);
}

function chileYmd(date: Date): string {
  return formatInTimeZone(date, DISPLAY_TIME_ZONE, "yyyy-MM-dd");
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMonths(ymd: string, months: number): string {
  const [year, month] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function mondayOf(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(ymd, offset);
}

function bucketsFor(period: MoodPeriod, limit: number, now: Date): Array<{ start: Date; end: Date }> {
  const today = chileYmd(now);
  const bounds: Array<{ startYmd: string; endYmd: string }> = [];

  if (period === "month" || period === "year") {
    const step = period === "year" ? 12 : 1;
    let cursor = `${today.slice(0, 7)}-01`;
    for (let i = 0; i < limit; i += 1) {
      const next = addMonths(cursor, step);
      bounds.push({ startYmd: cursor, endYmd: next });
      cursor = addMonths(cursor, -step);
    }
  } else if (period === "week") {
    let cursor = mondayOf(today);
    for (let i = 0; i < limit; i += 1) {
      bounds.push({ startYmd: cursor, endYmd: addDays(cursor, 7) });
      cursor = addDays(cursor, -7);
    }
  } else {
    let cursor = today;
    for (let i = 0; i < limit; i += 1) {
      bounds.push({ startYmd: cursor, endYmd: addDays(cursor, 1) });
      cursor = addDays(cursor, -1);
    }
  }

  return bounds.reverse().map((bound) => ({
    start: fromZonedTime(`${bound.startYmd}T00:00:00`, DISPLAY_TIME_ZONE),
    end: fromZonedTime(`${bound.endYmd}T00:00:00`, DISPLAY_TIME_ZONE),
  }));
}

export async function moodTimeline(
  ctx: UserCtx,
  period: MoodPeriod,
  limit: number,
  now = new Date(),
): Promise<MoodTimelinePoint[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 24);
  const buckets = bucketsFor(period, safeLimit, now);
  const { plays, genres } = await playsForMood(ctx, buckets[0].start, buckets[buckets.length - 1].end);

  return buckets.map((bucket) => {
    const slice = plays.filter((play) => {
      const at = new Date(play.played_at).getTime();
      return at >= bucket.start.getTime() && at < bucket.end.getTime();
    });
    const mood = summarize(slice, genres);
    return {
      ...mood,
      period_start: bucket.start.toISOString(),
      period_end: bucket.end.toISOString(),
    };
  });
}

function artistName(value: unknown): { name: string; genres: string[] | null } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as { name?: unknown; genres?: unknown };
  return {
    name: typeof record.name === "string" ? record.name : "",
    genres: Array.isArray(record.genres) ? (record.genres as string[]) : null,
  };
}

export async function recommendByMood(
  ctx: UserCtx,
  mood: string,
  limit: number,
  now = new Date(),
): Promise<MoodRecommendation[]> {
  const target = TARGETS[mood] ?? TARGETS.balanced;
  const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const { data, error } = await ctx.db.rpc("get_top_tracks", {
    start_date: start.toISOString(),
    end_date: now.toISOString(),
    result_limit: 150,
    p_user_id: ctx.userId,
  });
  if (error) throw new Error(error.message);

  const ranked = (Array.isArray(data) ? data : []) as Array<{ id?: string; name?: string }>;
  const ids = ranked.map((row) => row.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return [];

  const { data: tracks, error: trackError } = await ctx.db
    .from("tracks")
    .select("id, name, artist_id, artists(name, genres)")
    .in("id", ids);
  if (trackError) throw new Error(trackError.message);

  const scored: MoodRecommendation[] = [];
  for (const track of tracks ?? []) {
    const artist = artistName(track.artists);
    const vec = vectorForGenres(artist?.genres);
    if (!vec) continue;
    const distance = Math.sqrt((vec.valence - target.valence) ** 2 + (vec.energy - target.energy) ** 2);
    const score = 1 - distance / Math.SQRT2;
    scored.push({
      track_id: String(track.id),
      track_name: String(track.name ?? ""),
      artist_name: artist?.name || "Artista",
      valence: vec.valence,
      energy: vec.energy,
      mood_match_score: score,
    });
  }

  scored.sort((a, b) => b.mood_match_score - a.mood_match_score);
  const cutoff = scored.filter((row) => row.mood_match_score >= 0.55);
  return (cutoff.length >= 5 ? cutoff : scored).slice(0, limit);
}
