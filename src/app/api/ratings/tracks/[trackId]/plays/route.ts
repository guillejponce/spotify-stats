import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { trackId: string } }
) {
  try {
    const trackId = decodeURIComponent(params.trackId);
    if (!trackId) {
      return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { count } = await supabase
      .from("plays")
      .select("id", { count: "exact", head: true })
      .eq("track_id", trackId);

    const { data, error } = await supabase
      .from("plays")
      .select("id, played_at, ms_played, platform")
      .eq("track_id", trackId)
      .order("played_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({
      plays: data ?? [],
      total: count ?? 0,
    });
  } catch (e) {
    console.error("[api/ratings/tracks/plays]", e);
    return NextResponse.json(
      { error: "Failed to load plays", detail: String(e) },
      { status: 500 }
    );
  }
}
