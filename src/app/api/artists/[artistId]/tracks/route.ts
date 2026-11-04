import { NextRequest, NextResponse } from "next/server";
import { fetchArtistTracksInPeriod } from "@/lib/artist-browse";
import type { TimeFilter, TimeFilterParams } from "@/types/database";
import { requireUser } from "@/lib/auth";

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
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const artistId = decodeURIComponent(params.artistId);
    if (!artistId) {
      return NextResponse.json({ error: "Missing artist" }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const filterParams = parseParams(sp);
    const limit = Math.min(120, Math.max(1, Number(sp.get("limit") || 80)));

    const tracks = await fetchArtistTracksInPeriod(ctx, 
      filterParams,
      artistId,
      limit
    );

    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("[api/artists/.../tracks]", e);
    return NextResponse.json(
      { error: "Failed to load tracks", detail: String(e) },
      { status: 500 }
    );
  }
}
