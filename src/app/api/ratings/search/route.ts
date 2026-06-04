import { NextRequest, NextResponse } from "next/server";
import { searchTracksForRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ tracks: [] });
    }

    const tracks = await searchTracksForRating(q.trim(), 20);
    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("[api/ratings/search]", e);
    return NextResponse.json(
      { error: "Failed to search tracks", detail: String(e) },
      { status: 500 }
    );
  }
}
