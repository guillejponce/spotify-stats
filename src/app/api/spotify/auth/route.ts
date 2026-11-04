import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient } from "@/lib/auth";
import { SPOTIFY_SCOPES } from "@/lib/spotify";

export const dynamic = "force-dynamic";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}

/** Login y reconexión: Supabase Auth con Spotify (también renueva los scopes del token). */
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || request.nextUrl.origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = createSessionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      redirectTo,
      scopes: SPOTIFY_SCOPES,
      queryParams: { show_dialog: "true" },
    },
  });

  if (error || !data?.url) {
    console.error("[auth] signInWithOAuth failed", error);
    return NextResponse.redirect(new URL("/login?error=oauth_start", request.url));
  }
  return NextResponse.redirect(data.url);
}
