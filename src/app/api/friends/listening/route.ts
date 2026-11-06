import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listFriendsListening } from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const friends = await listFriendsListening(auth.ctx.db, auth.ctx.userId);
    return NextResponse.json({ friends });
  } catch (error) {
    console.error("[friends/listening]", error);
    return NextResponse.json({ error: "No se pudo cargar qué escuchan tus amigos" }, { status: 500 });
  }
}
