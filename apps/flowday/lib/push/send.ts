import 'server-only';
import { sendWebPush, type PushPayload } from '@flowday/core/notifications/push';
import { createServiceClient } from '@/lib/supabase/service';

// Entrega de push a todas las suscripciones del usuario; poda las caducas (404/410). §C-13.
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  const svc = createServiceClient();
  const { data: subs } = await svc
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  for (const s of subs ?? []) {
    const res = await sendWebPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload,
    );
    if (res.gone) {
      await svc.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
}
