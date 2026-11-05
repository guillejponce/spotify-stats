import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getProfileView } from "@/lib/friends";

export const dynamic = "force-dynamic";

/** Ficha pública para cualquiera activo; stats solo para uno mismo o amigos. */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const view = await getProfileView(
      ctx.db,
      ctx.userId,
      params.userId,
      request.nextUrl.searchParams.get("period")
    );
    if (!view) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    return NextResponse.json(view);
  } catch (e) {
    console.error("[api/users/:id]", e);
    return NextResponse.json({ error: "Error al cargar el perfil" }, { status: 500 });
  }
}
