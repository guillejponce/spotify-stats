import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseSetlistUsername, saveSetlistUser } from "@/lib/setlistfm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as { username?: unknown } | null;
  const username = parseSetlistUsername(typeof body?.username === "string" ? body.username : "");
  if (!username) {
    return NextResponse.json(
      { error: "Ese usuario no sirve. Pegá el nombre o el link de tu perfil de setlist.fm." },
      { status: 400 },
    );
  }

  try {
    await saveSetlistUser(auth.ctx, username);
    return NextResponse.json({ username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    await saveSetlistUser(auth.ctx, null);
    return NextResponse.json({ username: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo desconectar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
