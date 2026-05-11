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
      getTotalListeningTime(params).catch((e) => {
        console.warn("[stats] getTotalListeningTime", e);
        return { total_ms: 0, play_count: 0 };
      }),
      getTopTracks(params, 50).catch((e) => {
        console.warn("[stats] getTopTracks", e);
        return [];
      }),
      getTopArtists(params, 50).catch((e) => {
        console.warn("[stats] getTopArtists", e);
        return [];
      }),
      getTopAlbums(params, 50).catch((e) => {
        console.warn("[stats] getTopAlbums", e);
        return [];
      }),
      getListeningOverTime(params).catch((e) => {
        console.warn("[stats] getListeningOverTime", e);
        return [];
      }),
      getHourlyDistribution(params).catch((e) => {
        console.warn("[stats] getHourlyDistribution", e);
        return [];
      }),
      getPlatformBreakdown(params).catch((e) => {
        console.warn("[stats] getPlatformBreakdown", e);
        return [];
      }),
      getHeatmapData(year || new Date().getFullYear()).catch((e) => {
        console.warn("[stats] getHeatmapData", e);
        return [];
      }),
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
