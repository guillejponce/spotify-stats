import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
        platform,
        reason_start,
        reason_end,
        shuffle,
        offline,
        source,
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

    const plays = (data || []).map((play: Record<string, unknown>) => {
      const t = play.tracks as {
        name: string;
        artists: { name: string };
        albums: { name: string; image_url: string | null } | null;
      };
      return {
        id: play.id as string,
        played_at: play.played_at as string,
        ms_played: play.ms_played as number,
        platform: (play.platform as string | null) ?? null,
        reason_start: (play.reason_start as string | null) ?? null,
        reason_end: (play.reason_end as string | null) ?? null,
        shuffle: (play.shuffle as boolean | null) ?? null,
        offline: (play.offline as boolean | null) ?? null,
        source: (play.source as string | null) ?? null,
        track_name: t.name,
        artist_name: t.artists.name,
        album_name: t.albums?.name || null,
        image_url: t.albums?.image_url || null,
      };
    });

    return NextResponse.json({ plays });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
