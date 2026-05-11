import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";

export async function GET() {
  const url = getSpotifyAuthUrl();
  return NextResponse.redirect(url);
}
