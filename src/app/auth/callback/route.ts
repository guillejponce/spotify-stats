import { NextRequest, NextResponse } from "next/server";
import { createSessionSupabaseClient, getProfile } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { SPOTIFY_SCOPES } from "@/lib/spotify";

export const dynamic = "force-dynamic";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}

/**
 * Vuelta de Supabase Auth (Spotify). Supabase entrega provider_token y
 * provider_refresh_token solo en este momento, así que se guardan acá.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
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

  if (session.provider_token) {
    const row: Record<string, unknown> = {
      id: user.id,
      user_id: user.id,
      access_token: session.provider_token,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      scope: SPOTIFY_SCOPES,
    };
    if (session.provider_refresh_token) row.refresh_token = session.provider_refresh_token;
    const { error: tokenErr } = await db
      .from("spotify_tokens")
      .upsert(row, { onConflict: "user_id" });
    if (tokenErr) console.error("[auth/callback] spotify_tokens upsert failed", tokenErr);
  }

  const meta = user.user_metadata ?? {};
  await db
    .from("profiles")
    .update({
      display_name: meta.full_name ?? meta.name ?? null,
      avatar_url: meta.avatar_url ?? meta.picture ?? null,
      spotify_user_id: meta.provider_id ?? meta.sub ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  const profile = await getProfile(user.id);
  if (profile?.status !== "active") {
    return NextResponse.redirect(new URL("/pending", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
