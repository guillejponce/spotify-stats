import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const offset = Number(searchParams.get("offset") || 0);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const supabase = createServerSupabaseClient();

    /*
     * Sin `!inner`: incluye todas las filas de `plays` ( orden por played_at ).
     * El inner anterior ocultaba eventos cuando el join a track/artist no coincidía
     * (imports viejos, ids distintos, etc.) y parecía “solo lo reciente de la API”.
     */
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
        tracks (
          name,
          artists (name),
          albums (name, image_url)
        )
      `
      )
      .order("played_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const plays = (data || []).map((play: Record<string, unknown>) => {
      const t = play.tracks as null | {
        name: string;
        artists: { name: string } | null;
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
        track_name: t?.name ?? "(sin track)",
        artist_name: t?.artists?.name ?? "—",
        album_name: t?.albums?.name || null,
        image_url: t?.albums?.image_url ?? null,
      };
    });

    if (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.warn(
        "[history] SUPABASE_SERVICE_ROLE_KEY no definida: RLS puede ocultar filas en plays."
      );
    }

    return NextResponse.json(
      { plays },
      {
        headers: {
          "Cache-Control":
            "private, no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
