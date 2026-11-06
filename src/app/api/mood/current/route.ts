import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { currentMood } from "@/lib/mood";

export const dynamic = "force-dynamic";

/**
 * GET /api/mood/current
 * Mood del período reciente, a partir de la hora de las reproducciones.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const period = request.nextUrl.searchParams.get("period") || "week";
  if (!["day", "week", "month", "year"].includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    const mood = await currentMood(auth.ctx, period);
    return NextResponse.json({ mood, period, basis: "schedule" });
  } catch (error) {
    console.error("[mood/current] Error:", error);
    return NextResponse.json({ error: "No se pudo calcular el mood" }, { status: 500 });
  }
}
