import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mood/current
 * Obtiene el mood del período actual (última semana por defecto)
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "week";

  try {
    // Calcular fechas del período actual
    const now = new Date();
    let periodStart: Date;
    
    switch (period) {
      case "day":
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
        break;
      case "week":
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 7);
        break;
      case "month":
        periodStart = new Date(now);
        periodStart.setMonth(now.getMonth() - 1);
        break;
      case "year":
        periodStart = new Date(now);
        periodStart.setFullYear(now.getFullYear() - 1);
        break;
      default:
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 7);
    }

    const { data, error } = await auth.ctx.db.rpc("calculate_mood_snapshot", {
      p_user_id: auth.ctx.userId,
      p_period_start: periodStart.toISOString(),
      p_period_end: now.toISOString(),
      p_period_type: period,
    });

    if (error) {
      console.error("[mood/current] RPC error:", error);
      return NextResponse.json({ error: "Failed to calculate current mood" }, { status: 500 });
    }

    return NextResponse.json({
      mood: data || {},
      period,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
    });
  } catch (error) {
    console.error("[mood/current] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
