import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { forEachUser } from "@/lib/user-context";
import { isCronAuthorized } from "@/lib/auth";
import { isLastfmConfigured } from "@/lib/lastfm";
import { listActiveUsersWithLastfm, syncLastfmForUser } from "@/lib/lastfm-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLastfmConfigured()) {
    return NextResponse.json({ error: "Last.fm no está configurado" }, { status: 503 });
  }
  try {
    const db = createServerSupabaseClient();
    const users = await listActiveUsersWithLastfm(db);
    const results = await forEachUser(users, (ctx) => syncLastfmForUser(ctx));
    return NextResponse.json({ ok: results.every((r) => r.ok), users: results.length, results });
  } catch (e) {
    console.error("[cron/lastfm]", e);
    return NextResponse.json({ error: "Last.fm sync failed", detail: String(e) }, { status: 500 });
  }
}
