import { NextRequest, NextResponse } from "next/server";
import { isWebPushConfigured } from "@/lib/web-push";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Web Push no configurado (faltan VAPID keys)" },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const authKey = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { error: "Faltan endpoint / keys" },
      { status: 400 }
    );
  }

  const supabase = ctx.db;
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: ctx.userId,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("[api/push/subscribe]", error);
    return NextResponse.json(
      { error: "No se pudo guardar la suscripción", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });
  }

  const supabase = ctx.db;
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
