"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { syncRecentPlaysFromSpotify } from "@/lib/sync-recent-plays";

/** Usado desde el dashboard: corre en el servidor, sin exponer CRON_SECRET. */
export async function syncSpotifyRecentFromServer() {
  const supabase = createServerSupabaseClient();
  return syncRecentPlaysFromSpotify(supabase, 50);
}
