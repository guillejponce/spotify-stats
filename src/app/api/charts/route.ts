import { NextRequest, NextResponse } from "next/server";
import {
  fetchTrackForChart,
  getSongChart,
  listRecentCharts,
  upsertSongChart,
} from "@/lib/charts";
import { getTrackHarmony } from "@/lib/track-harmony";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NO_CACHE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

export async function GET(request: NextRequest) {
  try {
    const trackId = request.nextUrl.searchParams.get("track_id")?.trim();
    if (!trackId) {
      const recent = await listRecentCharts();
      return NextResponse.json({ chart: null, track: null, recent }, { headers: NO_CACHE });
    }

    const [chart, track, harmony] = await Promise.all([
      getSongChart(trackId),
      fetchTrackForChart(trackId),
      getTrackHarmony({
        dbTrackId: trackId,
        bypassCache: request.nextUrl.searchParams.get("debug") === "1",
      }),
    ]);

    const payload: Record<string, unknown> = {
      chart,
      track,
      recent: [],
      key: harmony.key,
      tempo: harmony.tempo,
    };
    if (request.nextUrl.searchParams.get("debug") === "1") {
      payload.harmony_debug = harmony.debug;
    }

    return NextResponse.json(payload, { headers: NO_CACHE });
  } catch (e) {
    console.error("[api/charts GET]", e);
    return NextResponse.json(
      { error: "No se pudo cargar la cifra", detail: String(e) },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      trackId?: string;
      content?: string;
      title?: string | null;
      artistName?: string | null;
      originalKey?: string | null;
      capo?: number | null;
    };

    if (!body.trackId || typeof body.content !== "string") {
      return NextResponse.json(
        { error: "trackId y content son obligatorios" },
        { status: 400 },
      );
    }

    const chart = await upsertSongChart({
      trackId: body.trackId,
      content: body.content,
      title: body.title,
      artistName: body.artistName,
      originalKey: body.originalKey,
      capo: body.capo,
    });

    return NextResponse.json({ chart });
  } catch (e) {
    console.error("[api/charts PUT]", e);
    return NextResponse.json(
      { error: "No se pudo guardar la cifra", detail: String(e) },
      { status: 500 },
    );
  }
}
