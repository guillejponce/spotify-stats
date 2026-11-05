import type { NextRequest } from "next/server";

/** Origen público de la app para armar URLs de vuelta de OAuth. */
export function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || request.nextUrl.origin;
}

export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}
