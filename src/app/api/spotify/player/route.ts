import { NextRequest, NextResponse } from "next/server";
import {
  SpotifyPlayerError,
  controlPlayback,
  getPlayerSnapshot,
} from "@/lib/spotify-player";

export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (err instanceof SpotifyPlayerError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  console.error("[spotify/player]", err);
  return NextResponse.json(
    { error: "No se pudo hablar con Spotify" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const snapshot = await getPlayerSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string };
    const action = body.action;
    if (
      action !== "play" &&
      action !== "pause" &&
      action !== "next" &&
      action !== "previous"
    ) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    await controlPlayback(action);
    const snapshot = await getPlayerSnapshot().catch(() => null);
    return NextResponse.json({ ok: true, player: snapshot });
  } catch (err) {
    return errorResponse(err);
  }
}
