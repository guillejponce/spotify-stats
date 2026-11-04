"use server";

import { getProfile, getSessionUserId } from "@/lib/auth";
import { syncRecentPlaysFromSpotify } from "@/lib/sync-recent-plays";
import { serviceCtx } from "@/lib/user-context";

/** Usado desde el dashboard: sincroniza solo la cuenta de la sesión. */
export async function syncSpotifyRecentFromServer() {
  const userId = await getSessionUserId();
  const profile = userId ? await getProfile(userId) : null;
  if (!userId || profile?.status !== "active") {
    return { synced: 0, skipped: 0, polled: 0, ok: false, error: "unauthorized" };
  }
  return syncRecentPlaysFromSpotify(serviceCtx(userId), 50);
}
