import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient, getProfile } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { saveSpotifyConnection, needsOnboarding } from "@/lib/spotify-connect";
import { safeNextPath } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Vuelta de Supabase Auth (Spotify o Google). Con Spotify, Supabase entrega
 * provider_token y provider_refresh_token solo en este momento: se guardan acá.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const sp = request.nextUrl.searchParams;
  const oauthError = sp.get("error_description") || sp.get("error_code") || sp.get("error");

  if (oauthError || !code) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", oauthError ? "oauth_denied" : "no_code");
    if (oauthError) url.searchParams.set("detail", oauthError.slice(0, 300));
    return NextResponse.redirect(url);
  }

  const supabase = createSessionSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error("[auth/callback] exchangeCodeForSession failed", error);
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "exchange");
    if (error?.message) url.searchParams.set("detail", error.message.slice(0, 300));
    return NextResponse.redirect(url);
  }

  const { session, user } = data;
  const db = createServerSupabaseClient();
  const viaSpotify = sp.get("via") !== "google";

  const meta = user.user_metadata ?? {};
  const { data: current } = await db
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  await db
    .from("profiles")
    .update({
      display_name: meta.full_name ?? meta.name ?? current?.display_name ?? null,
      avatar_url: meta.avatar_url ?? meta.picture ?? current?.avatar_url ?? null,
      ...(viaSpotify ? { spotify_user_id: meta.provider_id ?? meta.sub ?? null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  // Con Google, `provider_token` es de Google: no sirve para la API de Spotify.
  if (viaSpotify && session.provider_token) {
    await saveSpotifyConnection(db, user.id, {
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token,
    });
  }

  const profile = await getProfile(user.id);
  if (profile?.status !== "active") {
    return NextResponse.redirect(new URL("/pending", request.url));
  }
  if (next === "/" && (await needsOnboarding(db, user.id))) {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
