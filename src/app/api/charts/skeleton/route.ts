import { NextRequest, NextResponse } from "next/server";
import { buildChartFrame } from "@/lib/chart-skeleton";
import { getTrackHarmony } from "@/lib/track-harmony";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      artist?: string;
      trackId?: string;
    };
    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const trackId = String(body.trackId ?? "").trim() || undefined;
    if (!title) {
      return NextResponse.json({ error: "Falta el título" }, { status: 400 });
    }

    const harmony = await getTrackHarmony({ dbTrackId: trackId });
    const content = buildChartFrame({
      title,
      artist,
      key: harmony.key,
      tempo: harmony.tempo,
    });
    return NextResponse.json({
      content,
      key: harmony.key,
      tempo: harmony.tempo,
    });
  } catch (e) {
    console.error("[api/charts/skeleton]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message || "No se pudo armar la hoja" },
      { status: 500 },
    );
  }
}
