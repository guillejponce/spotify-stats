import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/app-url";
import { isLastfmConfigured, lastfmAuthUrl } from "@/lib/lastfm";

export const dynamic = "force-dynamic";

/** Manda a last.fm para que la persona autorice Statsify con su cuenta. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!isLastfmConfigured()) {
    return NextResponse.redirect(new URL("/welcome?lastfm=not_configured", request.url));
  }
  return NextResponse.redirect(lastfmAuthUrl(`${appOrigin(request)}/api/lastfm/callback`));
}
