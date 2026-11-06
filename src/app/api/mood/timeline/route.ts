import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { moodTimeline, type MoodPeriod } from "@/lib/mood";

export const dynamic = "force-dynamic";

const PERIODS = new Set<MoodPeriod>(["day", "week", "month", "year"]);

/**
 * GET /api/mood/timeline
 * Query params: period=day|week|month|year, limit
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const periodParam = request.nextUrl.searchParams.get("period") || "week";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "12", 10);
  if (!PERIODS.has(periodParam as MoodPeriod)) {
    return NextResponse.json(
      { error: "Invalid period. Must be: day, week, month, or year" },
      { status: 400 },
    );
  }

  try {
    const timeline = await moodTimeline(auth.ctx, periodParam as MoodPeriod, limit);
    return NextResponse.json({
      timeline: timeline.filter((point) => point.mood_label !== "no_data"),
      period: periodParam,
      limit,
      basis: "schedule",
    });
  } catch (error) {
    console.error("[mood/timeline] Error:", error);
    return NextResponse.json({ error: "No se pudo cargar el timeline" }, { status: 500 });
  }
}
