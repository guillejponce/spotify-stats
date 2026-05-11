import { NextRequest, NextResponse } from "next/server";
import {
  fetchArtistPeriodStats,
  fetchArtistProfile,
  fetchArtistTracksInPeriod,
} from "@/lib/artist-browse";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

export const dynamic = "force-dynamic";

function parseParams(sp: URLSearchParams): TimeFilterParams {
  const filter = (sp.get("filter") || "all") as TimeFilter;
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const month = sp.get("month") ? Number(sp.get("month")) : undefined;
  return { filter, year, month };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { artistId: string } }
) {
  try {
    const artistId = decodeURIComponent(params.artistId);
    if (!artistId) {
      return NextResponse.json({ error: "Missing artist" }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const filterParams = parseParams(sp);

    const [profile, stats, tracks] = await Promise.all([
      fetchArtistProfile(artistId),
      fetchArtistPeriodStats(filterParams, artistId),
      fetchArtistTracksInPeriod(filterParams, artistId, 50),
    ]);

    if (!profile && stats.play_count === 0) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    return NextResponse.json({
      artist:
        profile ??
        ({
          id: artistId,
          name: "Artista",
          image_url: null,
          spotify_url: null,
          genres: null,
        } as const),
      stats,
      tracks,
    });
  } catch (e) {
    console.error("[api/artists/...]", e);
    return NextResponse.json(
      { error: "Failed to load artist", detail: String(e) },
      { status: 500 }
    );
  }
}
