import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/friends/activity
 * Query params:
 *   - limit: number (default: 50)
 *   - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const { data, error } = await auth.ctx.db.rpc("get_friend_activity_feed", {
      p_user_id: auth.ctx.userId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error("[friends/activity] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to fetch friend activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      activities: data || [],
      count: data?.length || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[friends/activity] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
