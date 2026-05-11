import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { syncRecentPlaysFromSpotify } from "@/lib/sync-recent-plays";

/**
 * Cron / manual: requires CRON_SECRET in production.
 * La app abierta usa `syncSpotifyRecentFromServer` (server action) en su lugar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret) {
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "Set CRON_SECRET and send Authorization: Bearer <CRON_SECRET>",
      },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const result = await syncRecentPlaysFromSpotify(supabase, 50);

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
    });
  } catch (e) {
    console.error("[sync-recent]", e);
    return NextResponse.json(
      { error: "sync_failed", detail: String(e) },
      { status: 500 }
    );
  }
}
