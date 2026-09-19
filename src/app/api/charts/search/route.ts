import { NextRequest, NextResponse } from "next/server";
import { searchTracksForChart } from "@/lib/charts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ tracks: [] });
    }
    const tracks = await searchTracksForChart(q.trim(), 20);
    return NextResponse.json({ tracks });
  } catch (e) {
    console.error("[api/charts/search]", e);
    return NextResponse.json(
      { error: "No se pudo buscar", detail: String(e) },
      { status: 500 },
    );
  }
}
