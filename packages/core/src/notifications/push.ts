// =============================================================================
// Web Push (VAPID)  [SPEC §C-5.2 notifications/push, AR-6]
// Envío de notificaciones push. Backend-only (usa VAPID_PRIVATE_KEY, INV-4).
// =============================================================================

import webpush from 'web-push';
import { logger } from '../observability/logger';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:ops@flowday.app';
  if (!publicKey || !privateKey) {
    logger.warn({ event: 'push.not_configured' });
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushResult {
  ok: boolean;
  /** true si la suscripción ya no existe (404/410) y debe borrarse. */
  gone?: boolean;
}

export async function sendWebPush(
  sub: PushSubscriptionData,
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureConfigured()) return { ok: false };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (e) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return { ok: false, gone: true };
    logger.warn({ event: 'push.send_failed', status: statusCode });
    return { ok: false };
  }
}
