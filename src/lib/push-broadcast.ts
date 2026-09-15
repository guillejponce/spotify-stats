import { createServerSupabaseClient } from "@/lib/supabase";
import { sendWebPush, type PushSubscriptionJSON } from "@/lib/web-push";

export async function broadcastPush(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; pruned: number; subscribers: number; error?: string }> {
  const supabase = createServerSupabaseClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    return { sent: 0, pruned: 0, subscribers: 0, error: error.message };
  }
  if (!subs?.length) return { sent: 0, pruned: 0, subscribers: 0 };

  let sent = 0;
  const goneIds: string[] = [];

  for (const sub of subs) {
    const subscription: PushSubscriptionJSON = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    const result = await sendWebPush(subscription, payload);
    if (result.ok) sent += 1;
    if (result.gone) goneIds.push(sub.id);
  }

  if (goneIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", goneIds);
  }

  return { sent, pruned: goneIds.length, subscribers: subs.length };
}
