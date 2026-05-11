import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ imports: data || [] });
  } catch (error) {
    console.error("Imports list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch imports" },
      { status: 500 }
    );
  }
}
