import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * No secrets exposed. Lets you verify OAuth stored tokens server-side (Supabase spotify_tokens).
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("spotify_tokens")
      .select("expires_at, updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          connected: false,
          reason: error.message ?? "database_error",
        },
        { status: 200 }
      );
    }

    if (!data?.expires_at) {
      return NextResponse.json({
        connected: false,
        reason: "no_row",
      });
    }

    const expiresAt = new Date(data.expires_at);
    const now = new Date();

    return NextResponse.json({
      connected: true,
      expires_at: data.expires_at,
      updated_at: data.updated_at ?? null,
      access_token_expired: expiresAt <= now,
      hint:
        expiresAt <= now
          ? "Access token expired; OK if refresh_token is present — next /now-playing call refreshes automatically."
          : "Access token still valid.",
    });
  } catch {
    return NextResponse.json({
      connected: false,
      reason: "unexpected_error",
    });
  }
}
