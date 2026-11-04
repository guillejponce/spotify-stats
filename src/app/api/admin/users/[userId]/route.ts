import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "active", "blocked"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { db, userId: adminId } = auth.ctx;

  if (params.userId === adminId) {
    return NextResponse.json({ error: "No puedes cambiar tu propia cuenta" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const { data, error } = await db
    .from("profiles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", params.userId)
    .neq("role", "admin")
    .select("id, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  return NextResponse.json(data);
}
