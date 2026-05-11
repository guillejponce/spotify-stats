import { NextRequest, NextResponse } from "next/server";
import {
  getTotalListeningTime,
  getTopTracks,
  getTopArtists,
  getTopAlbums,
  getListeningOverTime,
  getHourlyDistribution,
  getPlatformBreakdown,
  getHeatmapData,
} from "@/lib/stats";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

    const [
      totalListening,
      topTracks,
      topArtists,
      topAlbums,
      listeningOverTime,
      hourlyData,
      platformData,
      heatmapData,
    ] = await Promise.all([
      getTotalListeningTime(params).catch(() => ({ total_ms: 0, play_count: 0 })),
      getTopTracks(params, 20).catch(() => []),
      getTopArtists(params, 20).catch(() => []),
      getTopAlbums(params, 20).catch(() => []),
      getListeningOverTime(params).catch(() => []),
      getHourlyDistribution(params).catch(() => []),
      getPlatformBreakdown(params).catch(() => []),
      getHeatmapData(year || new Date().getFullYear()).catch(() => []),
    ]);

    return NextResponse.json({
      totalMs: totalListening.total_ms,
      playCount: totalListening.play_count,
      topTracks,
      topArtists,
      topAlbums,
      listeningOverTime,
      hourlyData,
      platformData,
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
