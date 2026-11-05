import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countIncomingRequests } from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  return NextResponse.json({ incoming: await countIncomingRequests(ctx.db, ctx.userId) });
}
