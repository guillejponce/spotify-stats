import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/**
 * No secrets exposed. Lets you verify OAuth stored tokens server-side (Supabase spotify_tokens).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const { data, error } = await ctx.db
      .from("spotify_tokens")
      .select("expires_at, updated_at")
      .eq("user_id", ctx.userId)
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
