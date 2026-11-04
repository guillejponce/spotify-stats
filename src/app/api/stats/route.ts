import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardBundlePayload,
  getHeatmapData,
} from "@/lib/stats";
import { currentCalendarYearChile } from "@/lib/chile-time";
import type { TimeFilter, TimeFilterParams } from "@/types/database";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = (searchParams.get("filter") || "all") as TimeFilter;
    const year = searchParams.get("year")
      ? Number(searchParams.get("year"))
      : undefined;
    const month = searchParams.get("month")
      ? Number(searchParams.get("month"))
      : undefined;

    const params: TimeFilterParams = { filter, year, month };

    const heatmapYear =
      year != null && Number.isFinite(year)
        ? year
        : currentCalendarYearChile();

    const [bundle, heatmapData] = await Promise.all([
      getDashboardBundlePayload(ctx, params, 50),
      getHeatmapData(ctx, heatmapYear).catch((e) => {
        console.warn("[stats] getHeatmapData", e);
        return [];
      }),
    ]);

    return NextResponse.json({
      totalMs: bundle.totalMs,
      playCount: bundle.playCount,
      sessionCount: bundle.sessionCount,
      topTracks: bundle.topTracks,
      topArtists: bundle.topArtists,
      topAlbums: bundle.topAlbums,
      listeningOverTime: bundle.listeningOverTime,
      hourlyData: bundle.hourlyData,
      monthsTop: bundle.monthsTop,
      yearsBreakdown: bundle.yearsBreakdown,
      heatmapData,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
