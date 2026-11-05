import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/trends/dashboard
 * Obtiene el dashboard completo de tendencias: artistas y tracks trending,
 * rate de descubrimiento, etc.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { data, error } = await auth.ctx.db.rpc("get_trends_dashboard", {
      p_user_id: auth.ctx.userId,
    });

    if (error) {
      console.error("[trends/dashboard] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch trends dashboard" },
        { status: 500 }
      );
    }

    return NextResponse.json(data || {});
  } catch (error) {
    console.error("[trends/dashboard] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
