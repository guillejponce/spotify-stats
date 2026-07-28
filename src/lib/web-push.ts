import webpush from "web-push";

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function getVapidPrivateKey(): string | null {
  return process.env.VAPID_PRIVATE_KEY?.trim() || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}

function ensureVapid(): boolean {
  const pub = getVapidPublicKey();
  const priv = getVapidPrivateKey();
  if (!pub || !priv) return false;
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@statsify.local";
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

export async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  }
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  if (!ensureVapid()) {
    return { ok: false, error: "VAPID not configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/",
        tag: payload.tag,
      })
    );
    return { ok: true };
  } catch (e: unknown) {
    const statusCode =
      e && typeof e === "object" && "statusCode" in e
        ? Number((e as { statusCode: number }).statusCode)
        : undefined;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, gone: true, error: String(e) };
    }
    return { ok: false, error: String(e) };
  }
}
