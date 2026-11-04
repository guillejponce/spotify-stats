import { NextRequest, NextResponse } from "next/server";
import { searchTracksForRating } from "@/lib/ratings";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ tracks: [] });
    }

    const tracks = await searchTracksForRating(ctx, q.trim(), 20);
    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("[api/ratings/search]", e);
    return NextResponse.json(
      { error: "Failed to search tracks", detail: String(e) },
      { status: 500 }
    );
  }
}
