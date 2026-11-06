import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadSetlistsById } from "@/lib/setlistfm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 6)
    : [];
  if (!ids.length) return NextResponse.json({ setlists: [], retry: false });

  try {
    const result = await loadSetlistsById(ids);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar los setlists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
