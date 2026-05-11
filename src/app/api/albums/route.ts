import { NextRequest, NextResponse } from "next/server";
import { fetchAlbumsLeaderboard } from "@/lib/album-browse";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

export const dynamic = "force-dynamic";

function parseParams(sp: URLSearchParams): TimeFilterParams {
  const filter = (sp.get("filter") || "all") as TimeFilter;
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const month = sp.get("month") ? Number(sp.get("month")) : undefined;
  return { filter, year, month };
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = parseParams(sp);
    const q = sp.get("q") || "";
    const offset = Math.max(0, Number(sp.get("offset") || 0));
    const pageSize = Math.min(60, Math.max(1, Number(sp.get("limit") || 36)));
    const fetchN = pageSize + 1;

    const rows = await fetchAlbumsLeaderboard(params, {
      search: q,
      offset,
      limit: fetchN,
    });

    const hasMore = rows.length > pageSize;
    const albums = hasMore ? rows.slice(0, pageSize) : rows;

    return NextResponse.json({ albums, hasMore, offset, pageSize });
  } catch (e) {
    console.error("[api/albums]", e);
    return NextResponse.json(
      { error: "Failed to load albums", detail: String(e) },
      { status: 500 }
    );
  }
}
