import { NextRequest, NextResponse } from "next/server";
import {
  SITE_GATE_COOKIE,
  createGateToken,
  gateCookieBase,
  getSitePassword,
  isSitePasswordConfigured,
  passwordsMatch,
  safeNextPath,
} from "@/lib/site-auth";

export const dynamic = "force-dynamic";

function cookieSecure(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

function clearGateCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(SITE_GATE_COOKIE, "", {
    ...gateCookieBase(cookieSecure(request)),
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let intent = "";
  let input = "";
  let nextPath = "/";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      intent?: string;
      password?: string;
      next?: string;
    };
    intent = String(body.intent ?? "");
    input = String(body.password ?? "");
    nextPath = safeNextPath(body.next);
  } else {
    const form = await request.formData();
    intent = String(form.get("intent") ?? "");
    input = String(form.get("password") ?? "");
    nextPath = safeNextPath(form.get("next"));
  }

  if (intent === "lock") {
    const res = NextResponse.redirect(new URL("/unlock", request.url), 303);
    clearGateCookie(res, request);
    return res;
  }

  if (!isSitePasswordConfigured()) {
    return NextResponse.redirect(new URL(nextPath, request.url), 303);
  }

  const expected = getSitePassword();
  const match = await passwordsMatch(input, expected);
  if (!match) {
    const url = new URL("/unlock", request.url);
    url.searchParams.set("error", "1");
    if (nextPath !== "/") url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  const token = await createGateToken(expected);
  const res = NextResponse.redirect(new URL(nextPath, request.url), 303);
  res.cookies.set(SITE_GATE_COOKIE, token, gateCookieBase(cookieSecure(request)));
  return res;
}
