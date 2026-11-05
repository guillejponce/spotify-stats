import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/diversity/score
 * Query params:
 *   - start_date: ISO date string
 *   - end_date: ISO date string
 * 
 * Si no se proveen, usa el año actual
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = request.nextUrl;
  let startDate = searchParams.get("start_date");
  let endDate = searchParams.get("end_date");

  // Si no hay fechas, usar año actual
  if (!startDate || !endDate) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    startDate = yearStart.toISOString();
    endDate = now.toISOString();
  }

  try {
    const { data, error } = await auth.ctx.db.rpc("calculate_diversity_score", {
      p_user_id: auth.ctx.userId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error("[diversity/score] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to calculate diversity score" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      diversity: data || {},
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error("[diversity/score] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
