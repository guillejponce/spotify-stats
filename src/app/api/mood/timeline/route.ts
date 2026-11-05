import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mood/timeline
 * Query params:
 *   - period: 'day' | 'week' | 'month' | 'year' (default: 'week')
 *   - limit: number (default: 12)
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "week";
  const limit = parseInt(searchParams.get("limit") || "12", 10);

  // Validar period
  if (!["day", "week", "month", "year"].includes(period)) {
    return NextResponse.json(
      { error: "Invalid period. Must be: day, week, month, or year" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await auth.ctx.db.rpc("get_mood_timeline", {
      p_user_id: auth.ctx.userId,
      p_period_type: period,
      p_limit: limit,
    });

    if (error) {
      console.error("[mood/timeline] RPC error:", error);
      return NextResponse.json({ error: "Failed to fetch mood timeline" }, { status: 500 });
    }

    return NextResponse.json({
      timeline: data || [],
      period,
      limit,
    });
  } catch (error) {
    console.error("[mood/timeline] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
