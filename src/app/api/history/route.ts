import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const offset = Number(searchParams.get("offset") || 0);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("plays")
      .select(
        `
        id,
        played_at,
        ms_played,
        tracks!inner (
          name,
          artists!inner (name),
          albums (name, image_url)
        )
      `
      )
      .order("played_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const plays = (data || []).map((play: any) => ({
      id: play.id,
      played_at: play.played_at,
      ms_played: play.ms_played,
      track_name: play.tracks.name,
      artist_name: play.tracks.artists.name,
      album_name: play.tracks.albums?.name || null,
      image_url: play.tracks.albums?.image_url || null,
    }));

    return NextResponse.json({ plays });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
