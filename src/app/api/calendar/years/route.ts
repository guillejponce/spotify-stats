import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const supabase = ctx.db;

    const { data, error } = await supabase.rpc("get_calendar_available_years", {
      p_user_id: ctx.userId,
    });

    if (error) throw error;

    return NextResponse.json(
      { years: data ?? [] },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (err) {
    console.error("[calendar/years] API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch available years" },
      { status: 500 },
    );
  }
}
