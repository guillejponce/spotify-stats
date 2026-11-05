import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { syncLastfmForUser } from "@/lib/lastfm-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sincroniza ahora (botón "Revisar ahora" del onboarding). */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await syncLastfmForUser(auth.ctx));
}

/** Desconecta Last.fm. Las reproducciones ya traídas se quedan. */
export async function DELETE() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.db.from("lastfm_accounts").delete().eq("user_id", ctx.userId);
  if (error) {
    console.error("[api/lastfm DELETE]", error);
    return NextResponse.json({ error: "No se pudo desconectar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
