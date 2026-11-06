import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
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
  night_share: number;
  morning_share: number;
  day_share: number;
  evening_share: number;
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

const NO_DATA = "No hay reproducciones en este período.";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hourInChile(iso: string): number {
  return Number(formatInTimeZone(iso, DISPLAY_TIME_ZONE, "H"));
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
    night_share: 0,
    morning_share: 0,
    day_share: 0,
    evening_share: 0,
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

function whenPhrase(shares: { night: number; morning: number; day: number; evening: number }): string {
  const ranked: Array<[string, number]> = [
    ["de noche", shares.night],
    ["en la mañana", shares.morning],
    ["durante el día", shares.day],
    ["de tarde", shares.evening],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] - ranked[1][1] < 0.08) {
    return "La escuchaste repartida entre varios horarios.";
  }
  return `La mayor parte la escuchaste ${ranked[0][0]}.`;
}

export function snapshotFromPlays(plays: PlayRow[]): MoodSnapshot {
  if (!plays.length) return emptySnapshot(0, NO_DATA);

  let night = 0;
  let morning = 0;
  let day = 0;
  let evening = 0;
  const tracks = new Set<string>();

  for (const play of plays) {
    const ms = Math.max(Number(play.ms_played) || 0, 1);
    const hour = hourInChile(play.played_at);
    if (hour <= 5) night += ms;
    else if (hour <= 11) morning += ms;
    else if (hour <= 17) day += ms;
    else evening += ms;
    if (play.track_id) tracks.add(play.track_id);
  }

  const total = night + morning + day + evening || 1;
  const shares = {
    night: night / total,
    morning: morning / total,
    day: day / total,
    evening: evening / total,
  };
  const variety = tracks.size / plays.length;
  const avgValence = clamp01(
    0.35 + shares.evening * 0.42 + shares.day * 0.18 + shares.morning * 0.12 - shares.night * 0.28,
  );
  const avgEnergy = clamp01(
    0.28 + shares.evening * 0.5 + shares.day * 0.22 + shares.morning * 0.1 + variety * 0.02 - shares.night * 0.4,
  );
  const avgAcousticness = clamp01(shares.night * 0.85 + shares.morning * 0.7 + shares.day * 0.05);
  const label = classifyMood(avgValence, avgEnergy, avgAcousticness);

  return {
    mood_label: label,
    mood_intensity: intensity(avgValence, avgEnergy),
    avg_valence: avgValence,
    avg_energy: avgEnergy,
    avg_acousticness: avgAcousticness,
    avg_danceability: clamp01(shares.evening * 0.7 + shares.day * 0.25),
    total_plays: plays.length,
    unique_tracks: tracks.size,
    night_share: shares.night,
    morning_share: shares.morning,
    day_share: shares.day,
    evening_share: shares.evening,
    message: whenPhrase(shares),
  };
}

export function rollingRange(period: string, now = new Date()): { start: Date; end: Date } {
  const days = period === "day" ? 1 : period === "month" ? 30 : period === "year" ? 365 : 7;
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
}

export async function currentMood(ctx: UserCtx, period: string, now = new Date()): Promise<MoodSnapshot> {
  const { start, end } = rollingRange(period, now);
  return snapshotFromPlays(await loadPlays(ctx, start, end));
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
  const plays = await loadPlays(ctx, buckets[0].start, buckets[buckets.length - 1].end);

  return buckets.map((bucket) => {
    const slice = plays.filter((play) => {
      const at = new Date(play.played_at).getTime();
      return at >= bucket.start.getTime() && at < bucket.end.getTime();
    });
    const mood = snapshotFromPlays(slice);
    return {
      ...mood,
      period_start: bucket.start.toISOString(),
      period_end: bucket.end.toISOString(),
    };
  });
}

function hourMatchesMood(mood: string, hour: number): boolean {
  switch (mood) {
    case "melancholic":
      return hour <= 5;
    case "chill":
      return hour <= 5 || hour >= 22;
    case "focused":
      return hour >= 6 && hour <= 17;
    case "intense":
    case "energetic":
      return hour >= 18;
    case "euphoric":
    case "party":
      return hour >= 18 || hour <= 1;
    default:
      return true;
  }
}

function oneArtist(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const name = (row as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

export async function recommendByMood(
  ctx: UserCtx,
  mood: string,
  limit: number,
  now = new Date(),
): Promise<MoodRecommendation[]> {
  const start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const plays = await loadPlays(ctx, start, now);
  const totals = new Map<string, number>();

  for (const play of plays) {
    if (!play.track_id || !hourMatchesMood(mood, hourInChile(play.played_at))) continue;
    totals.set(play.track_id, (totals.get(play.track_id) ?? 0) + (Number(play.ms_played) || 0));
  }

  const ranked = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!ranked.length) return [];

  const ids = ranked.map(([id]) => id);
  const { data: tracks, error } = await ctx.db
    .from("tracks")
    .select("id, name, artists(name)")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map((tracks ?? []).map((track) => [String(track.id), track]));
  const maxMs = ranked[0][1] || 1;

  return ranked.flatMap(([id, ms]) => {
    const track = byId.get(id);
    if (!track) return [];
    return [{
      track_id: id,
      track_name: String(track.name ?? ""),
      artist_name: oneArtist(track.artists) || "Artista",
      valence: 0,
      energy: 0,
      mood_match_score: ms / maxMs,
    }];
  });
}
