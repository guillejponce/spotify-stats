import type { UserCtx } from "@/lib/user-context";
import { sendWebPush, type PushSubscriptionJSON } from "@/lib/web-push";

export async function broadcastPush(ctx: UserCtx, payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; pruned: number; subscribers: number; error?: string }> {
  const supabase = ctx.db;
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", ctx.userId);

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
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", ctx.userId)
      .in("id", goneIds);
  }

  return { sent, pruned: goneIds.length, subscribers: subs.length };
}
