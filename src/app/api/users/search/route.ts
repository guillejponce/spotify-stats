import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchUsers } from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ users: await searchUsers(ctx.db, ctx.userId, q) });
  } catch (e) {
    console.error("[api/users/search]", e);
    return NextResponse.json({ error: "Error al buscar" }, { status: 500 });
  }
}
