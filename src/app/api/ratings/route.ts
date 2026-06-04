import { NextRequest, NextResponse } from "next/server";
import { getRatedTracks, upsertRating } from "@/lib/ratings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
} as const;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const search = sp.get("q") || undefined;
    const offset = Math.max(0, Number(sp.get("offset") || 0));
    const limit = Math.min(60, Math.max(1, Number(sp.get("limit") || 36)));
    const sortBy = (sp.get("sort") || "rating_desc") as
      | "rating_desc"
      | "rating_asc"
      | "recent"
      | "name";

    const result = await getRatedTracks({ search, offset, limit, sortBy });
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    console.error("[api/ratings GET]", e);
    return NextResponse.json(
      { error: "Failed to load ratings", detail: String(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackId, rating } = body as { trackId?: string; rating?: number };

    if (!trackId || typeof rating !== "number") {
      return NextResponse.json(
        { error: "trackId (string) and rating (number 1-10) are required" },
        { status: 400 }
      );
    }

    const result = await upsertRating(trackId, rating);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/ratings POST]", e);
    return NextResponse.json(
      { error: "Failed to save rating", detail: String(e) },
      { status: 500 }
    );
  }
}
