import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recommendByMood } from "@/lib/mood";

export const dynamic = "force-dynamic";

const VALID_MOODS = [
  "euphoric",
  "energetic",
  "party",
  "chill",
  "melancholic",
  "intense",
  "focused",
  "balanced",
];

/**
 * GET /api/mood/recommendations?mood=&limit=
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const mood = request.nextUrl.searchParams.get("mood");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);

  if (!mood || !VALID_MOODS.includes(mood)) {
    return NextResponse.json(
      { error: `Invalid mood. Must be one of: ${VALID_MOODS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const recommendations = await recommendByMood(auth.ctx, mood, limit);
    return NextResponse.json({
      mood,
      recommendations,
      count: recommendations.length,
      basis: "schedule",
    });
  } catch (error) {
    console.error("[mood/recommendations] Error:", error);
    return NextResponse.json({ error: "No se pudieron cargar las recomendaciones" }, { status: 500 });
  }
}
