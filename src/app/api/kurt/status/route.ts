import { NextResponse } from "next/server";
import { getKurtStatus, kurtMood } from "@/lib/kurt";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getKurtStatus();
    return NextResponse.json({ ok: true, status, mood: kurtMood(status) });
  } catch (e) {
    console.error("[api/kurt/status]", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
