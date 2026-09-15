import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getHeatmapData } from "@/lib/stats";
import type { KurtDay, KurtStatus } from "@/lib/kurt-types";

export type { KurtDay, KurtStatus } from "@/lib/kurt-types";

function ymd(d: Date): string {
  return formatInTimeZone(d, DISPLAY_TIME_ZONE, "yyyy-MM-dd");
}

export function addYmd(date: string, days: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function hoursUntilChileMidnight(now: Date): number {
  const tomorrow = addYmd(ymd(now), 1);
  const midnight = fromZonedTime(`${tomorrow}T00:00:00.000`, DISPLAY_TIME_ZONE);
  return Math.max(0, (midnight.getTime() - now.getTime()) / 3_600_000);
}

function streakEndingOn(sorted: string[], end: string): number {
  const set = new Set(sorted);
  if (!set.has(end)) return 0;
  let n = 0;
  let cursor = end;
  while (set.has(cursor)) {
    n += 1;
    cursor = addYmd(cursor, -1);
  }
  return n;
}

function longestAndIncidents(sorted: string[]): {
  longest: number;
  incidents: number;
} {
  if (sorted.length === 0) return { longest: 0, incidents: 0 };
  let longest = 1;
  let cur = 1;
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const expected = addYmd(prev, 1);
    if (sorted[i] === expected) {
      cur += 1;
      longest = Math.max(longest, cur);
    } else {
      gaps += 1;
      cur = 1;
    }
  }
  return { longest, incidents: gaps };
}

export function buildKurtStatus(
  listenDays: string[],
  now: Date = new Date(),
): KurtStatus {
  const today = ymd(now);
  const yesterday = addYmd(today, -1);
  const set = new Set(listenDays);
  const sorted = Array.from(set).sort();
  const listened_today = set.has(today);
  const listened_yesterday = set.has(yesterday);

  let current_streak = 0;
  if (listened_today) current_streak = streakEndingOn(sorted, today);
  else if (listened_yesterday) current_streak = streakEndingOn(sorted, yesterday);

  const { longest, incidents } = longestAndIncidents(sorted);
  const recent: KurtDay[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = addYmd(today, -i);
    recent.push({ date, listened: set.has(date) });
  }

  return {
    today,
    listened_today,
    listened_yesterday,
    current_streak,
    longest_streak: Math.max(longest, current_streak),
    last_listen_day: sorted[sorted.length - 1] ?? null,
    incidents,
    total_listen_days: sorted.length,
    at_risk: !listened_today && listened_yesterday && current_streak > 0,
    kurt_down: current_streak === 0,
    hours_left_today: Math.round(hoursUntilChileMidnight(now) * 10) / 10,
    recent,
  };
}

async function loadListenDaysFallback(): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data: years, error } = await supabase.rpc(
    "get_calendar_available_years",
  );
  if (error) throw error;
  const ys = (Array.isArray(years) ? years : [])
    .map((r: { year?: unknown }) => Number(r.year))
    .filter((y) => Number.isFinite(y));

  const maps = await Promise.all(ys.map((y) => getHeatmapData(y)));
  const days: string[] = [];
  for (const rows of maps) {
    for (const r of rows) {
      if (r.ms_played >= 30_000 && r.date) days.push(r.date);
    }
  }
  return days;
}

export async function getKurtStatus(
  now: Date = new Date(),
): Promise<KurtStatus> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_listen_days");
  if (!error && Array.isArray(data)) {
    const days = data
      .map((r: { d?: unknown }) => {
        const raw = r.d;
        if (typeof raw === "string") return raw.slice(0, 10);
        return String(raw ?? "").slice(0, 10);
      })
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    return buildKurtStatus(days, now);
  }
  const fallback = await loadListenDaysFallback();
  return buildKurtStatus(fallback, now);
}

export function kurtMood(status: KurtStatus): {
  headline: string;
  subtitle: string;
  tone: "alive" | "risk" | "down";
} {
  if (status.kurt_down) {
    return {
      tone: "down",
      headline: "Kurt se disparó",
      subtitle:
        "Pasó un día sin música. Racha en 0. Un tema de 30 segundos lo resucita.",
    };
  }
  if (status.at_risk) {
    return {
      tone: "risk",
      headline: `${status.current_streak} día${status.current_streak === 1 ? "" : "s"} sin disparos`,
      subtitle: `Hoy todavía no escuchas. Quedan ~${Math.max(1, Math.round(status.hours_left_today))} h o Kurt amenaza con dispararse.`,
    };
  }
  return {
    tone: "alive",
    headline: `${status.current_streak} día${status.current_streak === 1 ? "" : "s"} sin disparos`,
    subtitle: "Kurt sigue en el invernadero. Hoy ya hay música: racha a salvo.",
  };
}
