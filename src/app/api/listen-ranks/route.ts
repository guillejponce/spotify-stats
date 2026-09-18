import { NextRequest, NextResponse } from "next/server";
import { getNowPlayingListenRanks } from "@/lib/listen-ranks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const trackId = request.nextUrl.searchParams.get("track_id")?.trim() || null;
  const artistId = request.nextUrl.searchParams.get("artist_id")?.trim() || null;

  if (!trackId && !artistId) {
    return NextResponse.json({ error: "track_id o artist_id" }, { status: 400 });
  }

  try {
    const ranks = await getNowPlayingListenRanks(trackId, artistId);
    return NextResponse.json(ranks, {
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (e) {
    console.error("[api/listen-ranks]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
