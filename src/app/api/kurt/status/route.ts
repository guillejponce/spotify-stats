import { NextResponse } from "next/server";
import { getKurtStatus, kurtMood } from "@/lib/kurt";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const status = await getKurtStatus(ctx);
    return NextResponse.json({ ok: true, status, mood: kurtMood(status) });
  } catch (e) {
    console.error("[api/kurt/status]", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
