import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  FriendError,
  listFriendships,
  removeFriendship,
  sendFriendRequest,
} from "@/lib/friends";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown, label: string) {
  if (e instanceof FriendError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(label, e);
  return NextResponse.json({ error: "Error en amigos" }, { status: 500 });
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    return NextResponse.json(await listFriendships(ctx.db, ctx.userId));
  } catch (e) {
    return errorResponse(e, "[api/friends GET]");
  }
}

/** Body `{ userId }`: manda solicitud (o acepta la que esa persona ya te mandó). */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
    if (typeof body.userId !== "string" || !body.userId) {
      return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    }
    const relation = await sendFriendRequest(ctx.db, ctx.userId, body.userId);
    return NextResponse.json({ relation });
  } catch (e) {
    return errorResponse(e, "[api/friends POST]");
  }
}

/** `?userId=`: cancela la solicitud enviada o elimina la amistad. */
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const other = request.nextUrl.searchParams.get("userId");
    if (!other) return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    await removeFriendship(ctx.db, ctx.userId, other);
    return NextResponse.json({ relation: "none" });
  } catch (e) {
    return errorResponse(e, "[api/friends DELETE]");
  }
}
