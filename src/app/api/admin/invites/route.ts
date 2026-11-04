import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Invita un email. Si esa persona ya entró y quedó pendiente, se activa de inmediato. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { db, userId } = auth.ctx;

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const { data: existing } = await db
    .from("profiles")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  const { error } = await db.from("invites").upsert(
    {
      email,
      invited_by: userId,
      used_at: existing ? new Date().toISOString() : null,
    },
    { onConflict: "email" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let activated = false;
  if (existing && existing.status === "pending") {
    const { error: upErr } = await db
      .from("profiles")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    activated = true;
  }

  return NextResponse.json({ email, activated });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const email = normalizeEmail(request.nextUrl.searchParams.get("email"));
  if (!email) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const { error } = await auth.ctx.db.from("invites").delete().eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
