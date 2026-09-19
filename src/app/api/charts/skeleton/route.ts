import { NextRequest, NextResponse } from "next/server";
import { generateChartSkeleton } from "@/lib/chart-skeleton";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  getSpotifyClientCredentialsToken,
  getSpotifyTrackTempoBpm,
} from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveTrackTempo(trackId: string | undefined): Promise<number | null> {
  const id = trackId?.trim();
  if (!id) return null;
  try {
    const supabase = createServerSupabaseClient();
    let token = await getSpotifyAccessToken(supabase);
    if (!token) token = await getSpotifyClientCredentialsToken();
    if (!token) return null;

    const read = async (bearer: string) => {
      try {
        return await getSpotifyTrackTempoBpm(bearer, id);
      } catch (e) {
        if (e instanceof Error && e.message === "EXPIRED_TOKEN") throw e;
        return null;
      }
    };

    try {
      const bpm = await read(token);
      if (bpm != null) return bpm;
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "EXPIRED_TOKEN") return null;
      token =
        (await forceRefreshSpotifyAccessToken(supabase)) ??
        (await getSpotifyClientCredentialsToken());
      if (!token) return null;
      const bpm = await read(token);
      if (bpm != null) return bpm;
    }

    const cc = await getSpotifyClientCredentialsToken();
    if (!cc || cc === token) return null;
    return await read(cc);
  } catch {
    return null;
  }
}

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

    const tempo = await resolveTrackTempo(trackId);
    const content = await generateChartSkeleton({ title, artist, tempo });
    return NextResponse.json({ content });
  } catch (e) {
    console.error("[api/charts/skeleton]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message || "No se pudo armar el esqueleto" },
      { status: 500 },
    );
  }
}
