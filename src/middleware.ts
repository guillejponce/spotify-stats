import { NextRequest, NextResponse } from "next/server";
import {
  SITE_GATE_COOKIE,
  getSitePassword,
  isPublicPath,
  isSitePasswordConfigured,
  isValidGateToken,
} from "@/lib/site-auth";

export async function middleware(request: NextRequest) {
  if (!isSitePasswordConfigured()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SITE_GATE_COOKIE)?.value;
  const ok = await isValidGateToken(token, getSitePassword());
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = "";
  if (pathname !== "/") {
    unlock.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
