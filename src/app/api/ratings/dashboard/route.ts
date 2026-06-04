import { NextResponse } from "next/server";
import { getRatingsDashboard } from "@/lib/ratings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dashboard = await getRatingsDashboard();
    return NextResponse.json(dashboard);
  } catch (e) {
    console.error("[api/ratings/dashboard]", e);
    return NextResponse.json(
      { error: "Failed to load ratings dashboard", detail: String(e) },
      { status: 500 }
    );
  }
}
