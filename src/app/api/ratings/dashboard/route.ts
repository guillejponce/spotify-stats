import { NextResponse } from "next/server";
import { getRatingsDashboard } from "@/lib/ratings";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const dashboard = await getRatingsDashboard(ctx);
    return NextResponse.json(dashboard, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (e) {
    console.error("[api/ratings/dashboard]", e);
    return NextResponse.json(
      { error: "Failed to load ratings dashboard", detail: String(e) },
      { status: 500 }
    );
  }
}
