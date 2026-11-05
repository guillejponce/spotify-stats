import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { FriendError, respondFriendRequest } from "@/lib/friends";

export const dynamic = "force-dynamic";

/** Body `{ accept: boolean }`: acepta o rechaza una solicitud recibida. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { friendshipId: string } }
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const body = (await request.json().catch(() => ({}))) as { accept?: unknown };
    if (typeof body.accept !== "boolean") {
      return NextResponse.json({ error: "Falta accept" }, { status: 400 });
    }
    await respondFriendRequest(ctx.db, ctx.userId, params.friendshipId, body.accept);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FriendError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/friends PATCH]", e);
    return NextResponse.json({ error: "Error en amigos" }, { status: 500 });
  }
}
