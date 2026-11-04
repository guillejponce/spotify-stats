import { NextRequest, NextResponse } from "next/server";
import { currentCalendarYearChile } from "@/lib/chile-time";
import { getWrappedPayload } from "@/lib/wrapped";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  const raw = Number(request.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(raw) && raw >= 2010 && raw <= 2100
    ? Math.floor(raw)
    : currentCalendarYearChile();

  try {
    const payload = await getWrappedPayload(ctx, year);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[api/wrapped]", e);
    return NextResponse.json(
      { error: "No se pudo armar el Wrapped", detail: String(e) },
      { status: 500 },
    );
  }
}
