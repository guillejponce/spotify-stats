import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const year = Number(sp.get("year"));
    const month = Number(sp.get("month"));
    const dayRaw = Number(sp.get("day") ?? 0);
    const limit = Math.min(Number(sp.get("limit") ?? 15), 50);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { error: "year and month (1-12) are required" },
        { status: 400 },
      );
    }

    const maxDay = daysInMonth(year, month);
    const day = dayRaw > 0 ? Math.min(dayRaw, maxDay) : 0;

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("get_calendar_memories", {
      target_year: year,
      target_month: month,
      target_day: day,
      result_limit: limit,
    });

    if (error) throw error;

    return NextResponse.json(data ?? { summary: null, tracks: [], artists: [], albums: [] }, {
      headers: {
        "Cache-Control":
          "private, no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err) {
    console.error("[calendar] API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch calendar memories" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(null, {
    headers: {
      "Cache-Control":
        "private, no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
