import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentlyPlaying } from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import type { KurtStatus } from "@/lib/kurt-types";

type CurrentlyPlaying = {
  is_playing?: boolean;
  progress_ms?: number;
  currently_playing_type?: string;
  item?: { id?: string; name?: string } | null;
};

/**
 * Recently Played no incluye el tema actual hasta que termina o lo skipeás.
 * Si Spotify dice que hay algo sonando (o pausado con ≥30s), cuenta como día escuchado.
 */
export function overlayListenedToday(status: KurtStatus): KurtStatus {
  if (status.listened_today) return status;
  const today = status.today;
  const current_streak = status.current_streak + 1;
  return {
    ...status,
    listened_today: true,
    at_risk: false,
    kurt_down: false,
    current_streak,
    longest_streak: Math.max(status.longest_streak, current_streak),
    last_listen_day: today,
    total_listen_days: status.total_listen_days + 1,
    recent: status.recent.map((day) =>
      day.date === today ? { ...day, listened: true } : day,
    ),
  };
}

export type LiveCreditResult = { counted: boolean; inserted: boolean };

/**
 * Detect whether Spotify reports something currently playing (or paused with
 * ≥30 s of progress).  Returns `{ counted: true }` so the caller can overlay
 * the streak in-memory via `overlayListenedToday`.
 *
 * **Does NOT insert into `plays`** — the sync functions (Recently Played API)
 * are the single source of truth for play rows.  This avoids near-duplicate
 * inserts caused by estimated vs. official `played_at` timestamps.
 */
export async function creditLiveListenIfNeeded(
  supabase: SupabaseClient,
): Promise<LiveCreditResult> {
  const none = { counted: false, inserted: false };
  let token = await getSpotifyAccessToken(supabase);
  if (!token) return none;

  let data: CurrentlyPlaying | null;
  try {
    data = (await getCurrentlyPlaying(token)) as CurrentlyPlaying | null;
  } catch (err) {
    if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
      const fresh = await forceRefreshSpotifyAccessToken(supabase);
      if (!fresh) return none;
      data = (await getCurrentlyPlaying(fresh)) as CurrentlyPlaying | null;
    } else {
      throw err;
    }
  }

  const track = data?.item;
  if (
    !data ||
    !track?.id ||
    !track.name ||
    data.currently_playing_type === "episode"
  ) {
    return none;
  }

  const progress = Number(data.progress_ms) || 0;
  const playing = Boolean(data.is_playing);
  if (!playing && progress < 30_000) return none;

  // Something is playing (or paused with meaningful progress).
  // The caller will use overlayListenedToday() for the Kurt streak UI.
  // The actual play row will arrive via the Recently Played sync later.
  return { counted: true, inserted: false };
}
