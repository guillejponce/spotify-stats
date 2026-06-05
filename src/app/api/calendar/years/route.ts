import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("get_calendar_available_years");

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
