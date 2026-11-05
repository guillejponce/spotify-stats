import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient } from "@/lib/auth";
import { appOrigin, safeNextPath } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/** Login con Google (Supabase Auth). No da acceso a Spotify: eso es aparte. */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectTo = `${appOrigin(request)}/auth/callback?via=google&next=${encodeURIComponent(next)}`;

  const supabase = createSessionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error || !data?.url) {
    console.error("[auth/google] signInWithOAuth failed", error);
    return NextResponse.redirect(new URL("/login?error=oauth_start", request.url));
  }
  return NextResponse.redirect(data.url);
}
