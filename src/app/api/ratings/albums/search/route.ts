import { NextRequest, NextResponse } from "next/server";
import { searchAlbumsForRating } from "@/lib/ratings";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ albums: [] });
    }

    const albums = await searchAlbumsForRating(ctx, q.trim(), 24);
    return NextResponse.json({ albums });
  } catch (e) {
    console.error("[api/ratings/albums/search]", e);
    return NextResponse.json(
      { error: "Failed to search albums", detail: String(e) },
      { status: 500 }
    );
  }
}
