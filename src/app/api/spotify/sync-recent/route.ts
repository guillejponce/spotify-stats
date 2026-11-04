import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isCronAuthorized, requireUser } from "@/lib/auth";
import { syncRecentPlaysFromSpotify } from "@/lib/sync-recent-plays";
import { forEachUser, listActiveUsersWithSpotify } from "@/lib/user-context";

/**
 * Con `Authorization: Bearer CRON_SECRET` sincroniza a todos los usuarios activos;
 * con sesión, solo la cuenta propia. El cron vivo de plays es la Edge Function `sync-plays`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    if (isCronAuthorized(request)) {
      const users = await listActiveUsersWithSpotify(createServerSupabaseClient());
      const results = await forEachUser(users, (ctx) => syncRecentPlaysFromSpotify(ctx, 50));
      return NextResponse.json({ users: results.length, results });
    }

    const auth = await requireUser();
    if ("response" in auth) return auth.response;
    const result = await syncRecentPlaysFromSpotify(auth.ctx, 50);

    if (!result.ok && result.error === "no_tokens") {
      return NextResponse.json(
        { error: "No Spotify tokens; connect Spotify first." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      synced: result.synced,
      skipped: result.skipped,
      polled: result.polled,
      images_enriched: result.images_enriched ?? 0,
    });
  } catch (e) {
    console.error("[sync-recent]", e);
    return NextResponse.json(
      { error: "sync_failed", detail: String(e) },
      { status: 500 }
    );
  }
}
