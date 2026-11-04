import { NextRequest, NextResponse } from "next/server";
import { runKurtAlertsJob } from "@/lib/kurt-alerts";
import { isWebPushConfigured } from "@/lib/web-push";
import { createServerSupabaseClient } from "@/lib/supabase";
import { forEachUser, listActiveUsersWithPush } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (secret) {
    return auth === `Bearer ${secret}`;
  }
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createServerSupabaseClient();
    const now = new Date();
    const users = await listActiveUsersWithPush(db);
    const results = await forEachUser(users, (ctx) => runKurtAlertsJob(ctx, now));
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      webPushConfigured: isWebPushConfigured(),
      users: results.length,
      results,
    });
  } catch (e) {
    console.error("[cron/kurt]", e);
    return NextResponse.json(
      { error: "Kurt alerts failed", detail: String(e) },
      { status: 500 },
    );
  }
}
