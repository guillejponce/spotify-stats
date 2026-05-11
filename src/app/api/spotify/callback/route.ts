import { NextRequest, NextResponse } from "next/server";
import { getSpotifyTokens } from "@/lib/spotify";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  try {
    const tokens = await getSpotifyTokens(code);
    const supabase = createServerSupabaseClient();

    const { error: dbError } = await supabase.from("spotify_tokens").upsert(
      {
        id: "default",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: new Date(
          Date.now() + tokens.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (dbError) {
      console.error("Failed to store tokens:", dbError);
      const base = new URL("/?error=token_storage", request.url);
      if (process.env.NODE_ENV === "development") {
        base.searchParams.set(
          "detail",
          `${dbError.code ?? ""} ${dbError.message ?? ""}`.slice(0, 300)
        );
      }
      return NextResponse.redirect(base);
    }

    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const base = new URL("/?error=callback_failed", request.url);
    if (process.env.NODE_ENV === "development") {
      base.searchParams.set("detail", msg.slice(0, 400));
    }
    return NextResponse.redirect(base);
  }
}
