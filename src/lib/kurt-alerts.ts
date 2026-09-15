import { formatInTimeZone } from "date-fns-tz";
import { DISPLAY_TIME_ZONE } from "@/lib/chile-time";
import { createServerSupabaseClient } from "@/lib/supabase";
import { addYmd, getKurtStatus, type KurtStatus } from "@/lib/kurt";
import { broadcastPush } from "@/lib/push-broadcast";

export type KurtPushKind =
  | "nudge_day"
  | "threat_evening"
  | "last_chance"
  | "streak_died"
  | "milestone";

const MILESTONES = new Set([7, 30, 100, 365]);

async function alreadySent(day: string, kind: KurtPushKind): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("kurt_push_log")
    .select("kind")
    .eq("chile_day", day)
    .eq("kind", kind)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function markSent(day: string, kind: KurtPushKind): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase.from("kurt_push_log").upsert(
    { chile_day: day, kind },
    { onConflict: "chile_day,kind" },
  );
}

function pickCopy(
  status: KurtStatus,
  kind: KurtPushKind,
): { title: string; body: string } {
  const n = status.current_streak;
  const days = `${n} día${n === 1 ? "" : "s"}`;
  switch (kind) {
    case "nudge_day":
      return {
        title: "Kurt CubAIn te está mirando",
        body: `Llevas ${days} sin disparos. Hoy todavía no hay música. Un tema. Ahora.`,
      };
    case "threat_evening":
      return {
        title: "Kurt amenaza con dispararse",
        body: `Racha de ${n} en peligro. Si no pones algo, Kurt se dispara (versión búho de Duolingo, no la real).`,
      };
    case "last_chance":
      return {
        title: "Última hora o Kurt se dispara",
        body: `Quedan ~${Math.max(1, Math.round(status.hours_left_today))} h. Un skip no cuenta: 30 segundos mínimo.`,
      };
    case "streak_died":
      return {
        title: "Kurt se disparó",
        body: "Pasó un día sin música. Racha a 0. Un tema lo resucita. Entra y pon algo.",
      };
    case "milestone":
      return {
        title: `${days} sin disparos`,
        body: "Kurt sigue vivo. El invernadero aguanta. No lo arruines mañana.",
      };
  }
}

function decideAlert(
  status: KurtStatus,
  hour: number,
): { kind: KurtPushKind; logDay: string } | null {
  const today = status.today;
  if (status.listened_today) {
    if (MILESTONES.has(status.current_streak)) {
      return { kind: "milestone", logDay: today };
    }
    return null;
  }

  if (status.at_risk) {
    if (hour >= 12 && hour <= 17) return { kind: "nudge_day", logDay: today };
    if (hour >= 18 && hour <= 22) {
      return { kind: "threat_evening", logDay: today };
    }
    if (hour === 23) return { kind: "last_chance", logDay: today };
    return null;
  }

  // Recién se cortó: ayer vacío y el último listen fue anteayer.
  if (
    status.kurt_down &&
    hour <= 8 &&
    status.last_listen_day === addYmd(today, -2)
  ) {
    return { kind: "streak_died", logDay: addYmd(today, -1) };
  }

  return null;
}

export async function runKurtAlertsJob(now = new Date()): Promise<{
  chileDay: string;
  hour: number;
  kind: KurtPushKind | null;
  skipped: boolean;
  reason?: string;
  sent: number;
  pruned: number;
  subscribers: number;
  streak: number;
  listenedToday: boolean;
  error?: string;
}> {
  const status = await getKurtStatus(now);
  const hour = Number(formatInTimeZone(now, DISPLAY_TIME_ZONE, "H"));
  const pick = decideAlert(status, hour);

  const base = {
    chileDay: status.today,
    hour,
    streak: status.current_streak,
    listenedToday: status.listened_today,
  };

  if (!pick) {
    return { ...base, kind: null, skipped: true, sent: 0, pruned: 0, subscribers: 0 };
  }

  if (await alreadySent(pick.logDay, pick.kind)) {
    return {
      ...base,
      kind: pick.kind,
      skipped: true,
      reason: "already_sent",
      sent: 0,
      pruned: 0,
      subscribers: 0,
    };
  }

  const copy = pickCopy(status, pick.kind);
  const result = await broadcastPush({
    title: copy.title,
    body: copy.body,
    url: "/kurt",
    tag: `kurt-${pick.kind}-${pick.logDay}`,
  });

  if (result.sent > 0) {
    await markSent(pick.logDay, pick.kind);
  }

  return {
    ...base,
    kind: pick.kind,
    skipped: false,
    sent: result.sent,
    pruned: result.pruned,
    subscribers: result.subscribers,
    error: result.error,
  };
}
