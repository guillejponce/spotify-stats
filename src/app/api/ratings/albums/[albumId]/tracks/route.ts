import { NextRequest, NextResponse } from "next/server";
import { getAlbumTracksForRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const albumId = decodeURIComponent(params.albumId);
    if (!albumId) {
      return NextResponse.json({ error: "Missing album" }, { status: 400 });
    }

    const tracks = await getAlbumTracksForRating(albumId, 300);
    return NextResponse.json({ tracks }, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (e) {
    console.error("[api/ratings/albums/tracks]", e);
    return NextResponse.json(
      { error: "Failed to load album tracks", detail: String(e) },
      { status: 500 }
    );
  }
}
