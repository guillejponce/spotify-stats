import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient } from "@/lib/auth";
import { SPOTIFY_SCOPES } from "@/lib/spotify";
import { appOrigin, safeNextPath } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/** Login y reconexión: Supabase Auth con Spotify (también renueva los scopes del token). */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectTo = `${appOrigin(request)}/auth/callback?via=spotify&next=${encodeURIComponent(next)}`;

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
