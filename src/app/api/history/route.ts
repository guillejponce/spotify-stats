import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { syncRecentPlaysFromSpotify } from "@/lib/sync-recent-plays";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function nestedName(
  rel:
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined,
): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  const name = row?.name?.trim();
  return name || null;
}

function nestedImage(
  rel:
    | { name?: string | null; image_url?: string | null }
    | { name?: string | null; image_url?: string | null }[]
    | null
    | undefined,
): { name: string | null; image_url: string | null } {
  if (!rel) return { name: null, image_url: null };
  const row = Array.isArray(rel) ? rel[0] : rel;
  return {
    name: row?.name?.trim() || null,
    image_url: row?.image_url ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const offsetRaw = Number(searchParams.get("offset") ?? 0);
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const pageSize = Math.min(
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50,
      100,
    );

    /** Pedimos una fila extra para saber si hay página siguiente sin COUNT. */
    const fetchSize = Math.min(pageSize + 1, 101);

    const supabase = createServerSupabaseClient();

    if (searchParams.get("sync") === "1") {
      try {
        await syncRecentPlaysFromSpotify(supabase, 50, {
          includeNowPlaying: true,
        });
      } catch (e) {
        console.warn("[history] spotify sync", e);
      }
    }

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
      `,
      )
      .order("played_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + fetchSize - 1);

    if (error) throw error;

    const raw = data ?? [];
    const hasMore = raw.length > pageSize;
    const pageRows = hasMore ? raw.slice(0, pageSize) : raw;

    const plays = pageRows.map((play: Record<string, unknown>) => {
      const t = play.tracks as null | {
        name?: string;
        artists?: { name?: string } | { name?: string }[] | null;
        albums?:
          | { name?: string; image_url?: string | null }
          | { name?: string; image_url?: string | null }[]
          | null;
      };
      const album = nestedImage(t?.albums);
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
        track_name: t?.name?.trim() || "(sin track)",
        artist_name: nestedName(t?.artists) ?? "—",
        album_name: album.name,
        image_url: album.image_url,
      };
    });

    if (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.warn(
        "[history] SUPABASE_SERVICE_ROLE_KEY no definida: RLS puede ocultar reproducciones en plays.",
      );
    }

    return NextResponse.json(
      {
        plays,
        has_more: hasMore,
        generated_at: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
