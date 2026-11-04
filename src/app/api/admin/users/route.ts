import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { db } = auth.ctx;

  const [profilesRes, invitesRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, status, created_at")
      .order("created_at", { ascending: true }),
    db
      .from("invites")
      .select("email, created_at, used_at")
      .order("created_at", { ascending: false }),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }
  if (invitesRes.error) {
    return NextResponse.json({ error: invitesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: profilesRes.data ?? [],
    invites: invitesRes.data ?? [],
  });
}
