import { z } from 'zod';
import { authorizeInternal } from '@/lib/internal-auth';
import { processOnce } from '@flowday/core/events/idempotency';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { sendWhatsAppText, fetchWhatsAppMedia } from '@flowday/core/notifications/whatsapp';
import { createServiceClient } from '@/lib/supabase/service';
import { canTransition, PHOTO_WINDOW_MIN } from '@/lib/blocks/state-machine';
import { verifyPhoto } from '@/lib/verify-photo';
import { getOrComputeDailyPlan } from '@/lib/planning/daily-plan';
import { getDaySummaryText } from '@/lib/blocks/day-summary';
import { computeCatchUp } from '@/lib/blocks/catch-up';
import { localDate, localMinutes, timeGreeting, timeToMinutes } from '@/lib/datetime';

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
const START_DAY_COMMAND = /^(comenzar|empezar|iniciar|start|dale)$/i; // D-10, §C-13.10
const WHATS_NEXT_COMMAND = /^(que sigue|qué sigue|ahora|siguiente)\??$/i; // D-12, §C-13.5d
const POSTPONE_COMMAND = /^(posponer|pospon)$/i; // D-12, §C-13.5d

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

  await sendWhatsAppText(phone, 'No entendí ese mensaje. Manda tu foto de evidencia o escribe "¿qué sigue?", "saldo", "racha" o "saltar".');
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
  // D-10: la foto puede ser de inicio (awaiting_start_photo) o de fin (awaiting_photo) — se
  // busca entre ambos estados y se verifica con la fase que corresponda al que se encuentre.
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, type, label, status, task_id')
    .eq('user_id', userId)
    .in('status', ['awaiting_start_photo', 'awaiting_photo']);

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
  const phase = block.status === 'awaiting_start_photo' ? 'start' : 'end';

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
      taskId: block.task_id,
      phase,
    });
    if (!result.verified) {
      await sendWhatsAppText(phone, `No se pudo verificar: ${result.message}`);
      return;
    }
    if (phase === 'start') {
      await sendWhatsAppText(phone, `✓ Arrancado. Nos vemos con la foto de que terminaste.`);
      return;
    }
    // Fase de fin verificada: encadena el siguiente bloque pendiente del día (§C-13.10, D-10).
    await sendWhatsAppText(phone, `✓ ${block.label} verificado. ${result.message}`);
    await announceNextBlock(svc, userId, phone);
  } catch {
    await sendWhatsAppText(phone, 'Hubo un error verificando tu foto. Tu bloque sigue esperando — intenta de nuevo.');
  }
}

/**
 * D-15, §C-13.3b: bloque `pending` de menor `start_time` para hoy — reagendando primero
 * (`computeCatchUp`) cualquiera cuya ventana original ya haya pasado por completo, para nunca
 * presentar algo incoherente como "empecemos ahora" con una hora ya vencida. Solo se toca al
 * interactuar activamente (comenzar/¿qué sigue?/tras verificar), nunca desde el cron pasivo.
 *
 * D-17: si la ventana de ese bloque ya empezó (por su horario original o por la reagenda de
 * arriba), lo arma directamente en `awaiting_start_photo` en vez de dejarlo en `pending`
 * esperando a que el cron pasivo coincida con su tick exacto — ese tick puede no volver a
 * pasar nunca (ya se movió), y `handlePhoto` solo acepta fotos de bloques ya armados. Presentar
 * algo como "esto es lo siguiente" implica que el sistema ya debe aceptar su foto de inicio.
 * Si en cambio su horario es genuinamente futuro (más tarde hoy), se deja en `pending` — el
 * scheduler lo arma en su momento real, sin adelantar el reloj de PHOTO_WINDOW_MIN de más.
 */
async function nextPendingBlock(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  today: string,
  tz: string,
): Promise<{ label: string; start_time: string; end_time: string; started: boolean } | null> {
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, label, start_time, end_time')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('status', 'pending');

  const candidates = blocks ?? [];
  if (candidates.length === 0) return null;

  const nowMin = localMinutes(new Date(), tz);
  const withEffective = candidates.map((b) => {
    const catchUp = computeCatchUp(nowMin, b.start_time, b.end_time);
    return {
      id: b.id,
      label: b.label,
      start_time: catchUp?.start_time ?? b.start_time,
      end_time: catchUp?.end_time ?? b.end_time,
      catchUp,
    };
  });

  withEffective.sort((a, b) => a.start_time.localeCompare(b.start_time));
  const next = withEffective[0];
  if (!next) return null;

  const started = timeToMinutes(next.start_time) <= nowMin;
  const update: Record<string, unknown> = { ...next.catchUp };
  if (started) update.status = 'awaiting_start_photo';
  if (Object.keys(update).length > 0) {
    await svc.from('blocks').update(update).eq('id', next.id);
  }

  return { label: next.label, start_time: next.start_time, end_time: next.end_time, started };
}

/** D-10: tras cada foto de fin verificada, anuncia el siguiente bloque `pending` del día o cierra. */
async function announceNextBlock(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
): Promise<void> {
  const { data: profile } = await svc.from('profiles').select('timezone').eq('id', userId).single();
  const tz = profile?.timezone ?? 'America/Bogota';
  const today = localDate(new Date(), tz);

  const next = await nextPendingBlock(svc, userId, today, tz);

  if (next) {
    const action = next.started ? 'Mándame la foto de que arrancaste.' : 'Mándame la foto cuando arranques.';
    await sendWhatsAppText(phone, `Siguiente: ${next.label} (${next.start_time}–${next.end_time}). ${action}`);
  } else {
    // D-12, §C-13.5e: resumen de cierre en vez de terminar en seco.
    const summary = await getDaySummaryText(svc, userId, tz);
    await sendWhatsAppText(phone, `Eso es todo por hoy.${summary} Buen trabajo — escribe "comenzar" mañana para seguir.`);
  }
}

async function handleCommand(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
  text: string,
): Promise<void> {
  const cmd = text.trim().toLowerCase();

  if (START_DAY_COMMAND.test(cmd)) {
    await handleStartDay(svc, userId, phone);
    return;
  }

  if (WHATS_NEXT_COMMAND.test(cmd)) {
    await handleWhatsNext(svc, userId, phone);
    return;
  }

  if (POSTPONE_COMMAND.test(cmd)) {
    const { data: blocks } = await svc
      .from('blocks')
      .select('id, label, status')
      .eq('user_id', userId)
      .in('status', ['awaiting_start_photo', 'awaiting_photo']);
    const candidates = blocks ?? [];
    if (candidates.length !== 1) {
      await sendWhatsAppText(phone, 'No encontré un único bloque esperando foto para posponer.');
      return;
    }
    const block = candidates[0]!;
    // D-12, §C-13.5d: reinicia la ventana de recordatorio (trg_blocks_touch, §C-7.2) sin
    // cambiar el estado — "posponer" no es "saltar", solo pide más tiempo.
    await svc.from('blocks').update({ status: block.status }).eq('id', block.id);
    await sendWhatsAppText(phone, `Vale, tienes ${PHOTO_WINDOW_MIN} minutos más para mandarme la foto de ${block.label}.`);
    return;
  }

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
      .in('status', ['awaiting_start_photo', 'active', 'awaiting_photo']);
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

  await sendWhatsAppText(
    phone,
    'Comandos: "saldo", "racha", "saltar", "posponer", "¿qué sigue?", "comenzar" — o manda tu foto de evidencia directo.',
  );
}

/**
 * D-12, §C-13.5d: responde de inmediato qué está pasando ahora, sin esperar la secuencia normal
 * de §C-13.10 — pensado para cuando el usuario se pierde a media tarea.
 */
async function handleWhatsNext(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
): Promise<void> {
  const { data: profile } = await svc.from('profiles').select('timezone').eq('id', userId).single();
  const tz = profile?.timezone ?? 'America/Bogota';
  const today = localDate(new Date(), tz);

  const { data: current } = await svc
    .from('blocks')
    .select('label, start_time, end_time, status')
    .eq('user_id', userId)
    .eq('date', today)
    .in('status', ['awaiting_start_photo', 'active', 'awaiting_photo'])
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (current) {
    const action =
      current.status === 'awaiting_start_photo'
        ? 'Mándame la foto de que arrancaste.'
        : current.status === 'active'
          ? `Sigues en esto hasta las ${current.end_time}.`
          : 'Mándame la foto de que terminaste.';
    await sendWhatsAppText(phone, `Ahora mismo: ${current.label} (${current.start_time}–${current.end_time}). ${action}`);
    return;
  }

  const next = await nextPendingBlock(svc, userId, today, tz);

  if (next && next.started) {
    // D-17: ya quedó armado en awaiting_start_photo — se presenta como "ahora", no "siguiente".
    await sendWhatsAppText(
      phone,
      `Ahora mismo: ${next.label} (${next.start_time}–${next.end_time}). Mándame la foto de que arrancaste.`,
    );
    return;
  }
  if (next) {
    await sendWhatsAppText(phone, `Nada activo ahora. Siguiente: ${next.label} (${next.start_time}–${next.end_time}).`);
    return;
  }

  const summary = await getDaySummaryText(svc, userId, tz);
  await sendWhatsAppText(phone, `No tienes nada pendiente ahora mismo.${summary}`);
}

/**
 * D-10, §C-13.10: palabra clave de arranque diario. El usuario, no la app, inicia la
 * conversación — así toda respuesta cae dentro de la ventana de 24h que él mismo abrió y
 * nunca hace falta una plantilla aprobada por Meta.
 */
async function handleStartDay(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  phone: string,
): Promise<void> {
  const { data: profile } = await svc.from('profiles').select('timezone, full_name').eq('id', userId).single();
  const tz = profile?.timezone ?? 'America/Bogota';
  const nowMin = localMinutes(new Date(), tz);
  // D-15: "Buenos días" a las 2pm no tiene sentido — el saludo sigue la hora real del usuario.
  const period = timeGreeting(nowMin);
  const greeting = profile?.full_name ? `${period} ${profile.full_name}!` : `${period}!`;
  const today = localDate(new Date(), tz);

  let plan: Awaited<ReturnType<typeof getOrComputeDailyPlan>>;
  try {
    plan = await getOrComputeDailyPlan(userId, today);
  } catch {
    await sendWhatsAppText(phone, 'No pude armar tu día ahora mismo. Intenta de nuevo en un momento.');
    return;
  }

  if (plan.length === 0) {
    await sendWhatsAppText(phone, 'No encontré tareas ni eventos para hoy. Crea un bloque desde la app cuando quieras.');
    return;
  }

  // ¿Ya hay algo en curso (arrancado o esperando foto)? Se muestra tal cual, sin reagendar —
  // el catch-up (D-15) solo aplica a bloques 'pending' que nunca llegaron a arrancar.
  const { data: inProgress } = await svc
    .from('blocks')
    .select('label, start_time, end_time, status')
    .eq('user_id', userId)
    .eq('date', today)
    .in('status', ['awaiting_start_photo', 'active'])
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (inProgress) {
    const msg =
      inProgress.status === 'awaiting_start_photo'
        ? `${greeting} Ya tienes ${inProgress.label} (${inProgress.start_time}–${inProgress.end_time}) esperando tu foto de inicio.`
        : `${greeting} Sigues con ${inProgress.label} (${inProgress.start_time}–${inProgress.end_time}).`;
    await sendWhatsAppText(phone, msg);
    return;
  }

  const next = await nextPendingBlock(svc, userId, today, tz);

  if (!next) {
    const summary = await getDaySummaryText(svc, userId, tz);
    await sendWhatsAppText(phone, `${greeting} ¡Ya completaste todo lo de hoy!${summary} Buen trabajo.`);
    return;
  }

  const photoHint = next.started
    ? 'Mándame la foto de que arrancaste.'
    : `Tienes ${PHOTO_WINDOW_MIN} minutos para mandarme la foto de que arrancaste una vez empiece.`;
  await sendWhatsAppText(
    phone,
    `${greeting} Hoy empezamos con ${next.label} (${next.start_time}–${next.end_time}). ${photoHint}`,
  );
}
