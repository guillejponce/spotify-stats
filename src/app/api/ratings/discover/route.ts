import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(1, Number(sp.get("limit") || 10)),
      30
    );
    const excludeIds: string[] = sp.get("exclude")
      ? sp.get("exclude")!.split(",").filter(Boolean)
      : [];

    const supabase = createServerSupabaseClient();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_unrated_random_tracks",
      { result_limit: limit, p_exclude_ids: excludeIds.length > 0 ? excludeIds : ["__none__"] }
    );

    if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
      return NextResponse.json({ tracks: rpcData });
    }

    // Fallback: manual query
    let query = supabase
      .from("plays")
      .select("track_id")
      .order("played_at", { ascending: false })
      .limit(500);

    const { data: playRows } = await query;
    const playedSet = new Set<string>();
    for (const p of playRows || []) playedSet.add(String(p.track_id));
    const playedIds = Array.from(playedSet);

    if (playedIds.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    const { data: ratedRows } = await supabase
      .from("song_ratings")
      .select("track_id")
      .in("track_id", playedIds);

    const ratedSet = new Set((ratedRows || []).map((r) => String(r.track_id)));
    let unrated = playedIds.filter((id) => !ratedSet.has(id) && !excludeIds.includes(id));

    // Shuffle
    for (let i = unrated.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unrated[i], unrated[j]] = [unrated[j], unrated[i]];
    }

    const selected = unrated.slice(0, limit);

    if (selected.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    const { data: trackRows } = await supabase
      .from("tracks")
      .select("id, name, artist_id, album_id, artists(name, image_url), albums(name, image_url)")
      .in("id", selected);

    const { data: playCounts } = await supabase
      .from("plays")
      .select("track_id")
      .in("track_id", selected);

    const countMap = new Map<string, number>();
    for (const p of playCounts || []) {
      const tid = String(p.track_id);
      countMap.set(tid, (countMap.get(tid) || 0) + 1);
    }

    const tracks = (trackRows || []).map((row: Record<string, unknown>) => {
      const artist = row.artists as Record<string, unknown> | null;
      const album = row.albums as Record<string, unknown> | null;
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        artist_id: row.artist_id ? String(row.artist_id) : null,
        artist_name: artist?.name ? String(artist.name) : null,
        album_name: album?.name ? String(album.name) : null,
        image_url:
          (album?.image_url as string | null) ??
          (artist?.image_url as string | null) ??
          null,
        play_count: countMap.get(String(row.id)) ?? 0,
      };
    });

    // Shuffle result to keep randomness
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }

    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("[api/ratings/discover]", e);
    return NextResponse.json(
      { error: "Failed to fetch discover tracks", detail: String(e) },
      { status: 500 }
    );
  }
}
