// =============================================================================
// WhatsApp Cloud API (oficial, Meta)  [SPEC §C-13.10, AR-6]
// Canal adicional opt-in — nunca reemplaza Web Push (AR-6). Solo texto libre
// dentro de la ventana de sesión de 24h (responde a un inbound); nunca
// plantillas (eso es mensajería proactiva, decisión aparte por su costo).
// Backend-only (usa WHATSAPP_ACCESS_TOKEN, INV-4).
// =============================================================================

import { logger } from '../observability/logger';

const GRAPH_VERSION = 'v22.0';

function ensureConfigured(): { phoneNumberId: string; token: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    logger.warn({ event: 'whatsapp.not_configured' });
    return null;
  }
  return { phoneNumberId, token };
}

export interface WhatsAppSendResult {
  ok: boolean;
}

/** Envía un mensaje de texto libre. Solo válido dentro de la ventana de 24h de sesión. */
export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  const cfg = ensureConfigured();
  if (!cfg) return { ok: false };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      },
    );
    if (!res.ok) {
      logger.warn({ event: 'whatsapp.send_failed', status: res.status });
      return { ok: false };
    }
    return { ok: true };
  } catch {
    logger.warn({ event: 'whatsapp.send_failed', status: 0 });
    return { ok: false };
  }
}

/** Resuelve la URL de descarga temporal de un media entrante (foto) y lo trae como bytes. */
export async function fetchWhatsAppMedia(
  mediaId: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const cfg = ensureConfigured();
  if (!cfg) return null;

  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, {
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    if (!fileRes.ok) return null;
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    return { bytes, mimeType: meta.mime_type ?? 'image/jpeg' };
  } catch {
    logger.warn({ event: 'whatsapp.media_fetch_failed' });
    return null;
  }
}
