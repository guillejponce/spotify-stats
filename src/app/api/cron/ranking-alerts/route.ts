import { NextRequest, NextResponse } from "next/server";
import { runRankingAlertsJob } from "@/lib/ranking-alerts";
import { isWebPushConfigured } from "@/lib/web-push";
import { createServerSupabaseClient } from "@/lib/supabase";
import { forEachUser, listActiveUserIds } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (secret) {
    return auth === `Bearer ${secret}`;
  }
  // Local / sin secreto: permitir fuera de producción.
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createServerSupabaseClient();
    const now = new Date();
    const users = await listActiveUserIds(db);
    const results = await forEachUser(users, (ctx) => runRankingAlertsJob(ctx, now));
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      webPushConfigured: isWebPushConfigured(),
      users: results.length,
      results,
    });
  } catch (e) {
    console.error("[cron/ranking-alerts]", e);
    return NextResponse.json(
      { error: "Ranking alerts failed", detail: String(e) },
      { status: 500 }
    );
  }
}
