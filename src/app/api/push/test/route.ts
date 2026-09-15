import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendWebPush, isWebPushConfigured } from "@/lib/web-push";
import { broadcastPush } from "@/lib/push-broadcast";

export const dynamic = "force-dynamic";

type Body = {
  endpoint?: string;
  title?: string;
  body?: string;
};

export async function POST(request: NextRequest) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Web Push no configurado (faltan VAPID keys)" },
      { status: 503 },
    );
  }

  let payload: Body = {};
  try {
    payload = (await request.json()) as Body;
  } catch {
    payload = {};
  }

  const title = payload.title?.trim() || "Kurt CubAIn de prueba";
  const body =
    payload.body?.trim() ||
    "Si lees esto, las notificaciones ya funcionan. No me hagas dispararme de verdad.";
  const endpoint = payload.endpoint?.trim();

  if (endpoint) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Esa suscripción no está guardada todavía." },
        { status: 404 },
      );
    }

    const result = await sendWebPush(
      { endpoint: data.endpoint, keys: { p256dh: data.p256dh, auth: data.auth } },
      { title, body, url: "/kurt", tag: "kurt-test" },
    );
    return NextResponse.json({
      ok: result.ok,
      sent: result.ok ? 1 : 0,
      error: result.error,
    });
  }

  const result = await broadcastPush({
    title,
    body,
    url: "/kurt",
    tag: "kurt-test",
  });
  return NextResponse.json({ ok: result.sent > 0, ...result });
}
