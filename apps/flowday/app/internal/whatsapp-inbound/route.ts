import { z } from 'zod';
import { authorizeInternal } from '@/lib/internal-auth';
import { processOnce } from '@flowday/core/events/idempotency';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { sendWhatsAppText, fetchWhatsAppMedia } from '@flowday/core/notifications/whatsapp';
import { createServiceClient } from '@/lib/supabase/service';
import { canTransition } from '@/lib/blocks/state-machine';
import { verifyPhoto } from '@/lib/verify-photo';

// =============================================================================
// Webhook WhatsApp inbound  [NORMATIVO — SPEC §C-13.10]
// n8n ya validó la firma de Meta (X-Hub-Signature-256, nodo WhatsApp Trigger) y
// reenvía el `value` ya desempaquetado (un item por `change`, no el sobre
// entry[].changes[] completo — ver InboundBody). Autenticado igual que el resto de /internal/* (D-6,
// §C-25): secreto compartido en cabecera x-internal-secret, credencial nativa
// de n8n `FlowDay Internal Admin` (id FLOWDAYADMIN0001) — no HMAC ni $env.
// Idempotencia por wamid (INV-6). Canal ADICIONAL opt-in (AR-6) — nunca
// reemplaza el flujo de la PWA, solo lo complementa: vincular número, mandar
// foto de evidencia, comandos cortos.
// =============================================================================
export const dynamic = 'force-dynamic';

const InboundMessage = z.object({
  id: z.string(),
  from: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ id: z.string() }).optional(),
});

// El nodo WhatsApp Trigger de n8n ya desempaqueta el sobre crudo de Meta
// (entry[].changes[].value) y reenvía el `value` directo, con un item por
// `change` — no {entry:[{changes:[{value:{...}}]}]}, sino {messaging_product,
// metadata, contacts, messages, field} tal cual (confirmado contra un payload
// real: WhatsAppTrigger.node.js hace `{...change.value, field: change.field}`).
const InboundBody = z.object({
  messages: z.array(InboundMessage).optional(),
});

const LINK_COMMAND = /^link\s+(\d{6})$/i;

function toE164(waId: string): string {
  return waId.startsWith('+') ? waId : `+${waId}`;
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!authorizeInternal(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }

  const parsed = InboundBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: 'bad_request', message: 'invalid payload' } }, { status: 400 });
  }

  const messages = parsed.data.messages ?? [];

  for (const msg of messages) {
    await processOnce(msg.id, 'whatsapp', async () => {
      await handleMessage(msg);
    });
  }

  logger.info({ event: 'webhook.whatsapp.ok', request_id: requestId, route: '/internal/whatsapp-inbound' });
  return Response.json({ ok: true });
}

async function handleMessage(msg: z.infer<typeof InboundMessage>): Promise<void> {
  const svc = createServiceClient();
  const phone = toE164(msg.from);

  const { data: link } = await svc
    .from('whatsapp_links')
    .select('user_id, phone_e164, link_code, link_code_expires')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (!link) {
    await handleUnlinked(svc, phone, msg);
    return;
  }

  if (msg.type === 'image' && msg.image) {
    await handlePhoto(svc, link.user_id, phone, msg.image.id);
    return;
  }

  if (msg.type === 'text' && msg.text) {
    await handleCommand(svc, link.user_id, phone, msg.text.body);
    return;
  }

  await sendWhatsAppText(phone, 'No entendí ese mensaje. Manda tu foto de evidencia o escribe "saldo", "racha" o "saltar".');
}

async function handleUnlinked(
  svc: ReturnType<typeof createServiceClient>,
  phone: string,
  msg: z.infer<typeof InboundMessage>,
): Promise<void> {
  const text = msg.text?.body ?? '';
  const match = text.match(LINK_COMMAND);
  if (!match) {
    await sendWhatsAppText(
      phone,
      'Tu WhatsApp no está vinculado a FlowDay todavía. Entra a Ajustes en la app, dale "Conectar WhatsApp" y manda el código que te muestre (ej: "LINK 482913").',
    );
    return;
  }

  const code = match[1]; // LINK_COMMAND tiene exactamente un grupo de captura: siempre presente si match existe.
  if (!code) return;
  const { data: pending } = await svc
    .from('whatsapp_links')
    .select('user_id, link_code_expires')
    .eq('link_code', code)
    .maybeSingle();

  if (!pending || !pending.link_code_expires || new Date(pending.link_code_expires) < new Date()) {
    await sendWhatsAppText(phone, 'Ese código no es válido o ya expiró. Genera uno nuevo en Ajustes.');
    return;
  }

  const { error } = await svc
    .from('whatsapp_links')
    .update({ phone_e164: phone, linked_at: new Date().toISOString(), link_code: null, link_code_expires: null })
    .eq('user_id', pending.user_id);

  if (error) {
    logger.error({ event: 'whatsapp.link_confirm_failed', error: { code: 'internal' } });
    await sendWhatsAppText(phone, 'Algo salió mal vinculando tu cuenta. Intenta de nuevo desde Ajustes.');
    return;
  }

  await sendWhatsAppText(phone, '✅ Listo, tu WhatsApp quedó vinculado a FlowDay. Ya puedes mandar tu foto de evidencia aquí cuando termines un bloque.');
}

async function handlePhoto(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
  mediaId: string,
): Promise<void> {
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, type, label')
    .eq('user_id', userId)
    .eq('status', 'awaiting_photo');

  const candidates = blocks ?? [];
  if (candidates.length === 0) {
    await sendWhatsAppText(phone, 'No tienes ningún bloque esperando foto ahora mismo.');
    return;
  }
  if (candidates.length > 1) {
    const list = candidates.map((b) => `- ${b.label}`).join('\n');
    await sendWhatsAppText(phone, `Tienes varios bloques esperando foto, termina uno a la vez desde la app:\n${list}`);
    return;
  }
  const block = candidates[0]!;

  const media = await fetchWhatsAppMedia(mediaId);
  if (!media) {
    await sendWhatsAppText(phone, 'No pude descargar tu foto, intenta mandarla de nuevo.');
    return;
  }

  const ext = media.mimeType.includes('png') ? 'png' : media.mimeType.includes('webp') ? 'webp' : 'jpg';
  const photoPath = `${userId}/${block.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await svc.storage
    .from('evidence-photos')
    .upload(photoPath, media.bytes, { contentType: media.mimeType });
  if (upErr) {
    logger.error({ event: 'whatsapp.photo_upload_failed', error: { code: 'internal' } });
    await sendWhatsAppText(phone, 'No pude subir tu foto, intenta de nuevo.');
    return;
  }

  try {
    const result = await verifyPhoto({
      userId,
      blockId: block.id,
      photoPath,
      blockType: block.type,
      taskName: block.label,
    });
    await sendWhatsAppText(
      phone,
      result.verified ? `✓ ¡Verificado! ${result.message}` : `No se pudo verificar: ${result.message}`,
    );
  } catch {
    await sendWhatsAppText(phone, 'Hubo un error verificando tu foto. Tu bloque sigue esperando — intenta de nuevo.');
  }
}

async function handleCommand(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
  text: string,
): Promise<void> {
  const cmd = text.trim().toLowerCase();

  if (cmd === 'saldo') {
    const { data } = await svc.from('credits').select('balance').eq('user_id', userId).single();
    await sendWhatsAppText(phone, `Tu saldo es $${(data?.balance ?? 0).toFixed(2)}.`);
    return;
  }

  if (cmd === 'racha') {
    const { data } = await svc.from('profiles').select('streak').eq('id', userId).single();
    await sendWhatsAppText(phone, `Llevas ${data?.streak ?? 0} día(s) de racha.`);
    return;
  }

  if (cmd === 'saltar') {
    const { data: blocks } = await svc
      .from('blocks')
      .select('id, label, status')
      .eq('user_id', userId)
      .in('status', ['active', 'awaiting_photo']);
    const candidates = blocks ?? [];
    if (candidates.length !== 1) {
      await sendWhatsAppText(phone, 'No encontré un único bloque activo para saltar. Hazlo desde la app.');
      return;
    }
    const block = candidates[0]!;
    if (!canTransition(block.status, 'skipped')) {
      await sendWhatsAppText(phone, 'Ese bloque no se puede saltar en su estado actual.');
      return;
    }
    await svc.from('blocks').update({ status: 'skipped' }).eq('id', block.id);
    await sendWhatsAppText(phone, `Saltado: ${block.label}.`);
    return;
  }

  await sendWhatsAppText(phone, 'Comandos: "saldo", "racha", "saltar" — o manda tu foto de evidencia directo.');
}
