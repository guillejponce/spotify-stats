import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mood/recommendations
 * Query params:
 *   - mood: 'euphoric' | 'energetic' | 'party' | 'chill' | 'melancholic' | 'intense' | 'focused'
 *   - limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = request.nextUrl;
  const mood = searchParams.get("mood");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!mood) {
    return NextResponse.json({ error: "Missing mood parameter" }, { status: 400 });
  }

  const validMoods = [
    "euphoric",
    "energetic",
    "party",
    "chill",
    "melancholic",
    "intense",
    "focused",
    "balanced",
  ];

  if (!validMoods.includes(mood)) {
    return NextResponse.json(
      { error: `Invalid mood. Must be one of: ${validMoods.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await auth.ctx.db.rpc("recommend_tracks_by_mood", {
      p_user_id: auth.ctx.userId,
      p_target_mood: mood,
      p_limit: limit,
    });

    if (error) {
      console.error("[mood/recommendations] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch recommendations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mood,
      recommendations: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("[mood/recommendations] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
