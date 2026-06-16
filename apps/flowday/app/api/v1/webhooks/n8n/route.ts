import { z } from 'zod';
import { verifyHmacSignature } from '@flowday/core/security/hmac';
import { processOnce } from '@flowday/core/events/idempotency';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { createServiceClient } from '@/lib/supabase/service';
import { canTransition } from '@/lib/blocks/state-machine';
import { pushToUser } from '@/lib/push/send';

// =============================================================================
// Webhook n8n → app  [NORMATIVO — SPEC §C-12.3]
// 1) Verifica firma HMAC (INV-5) — inválida ⇒ 401, sin efectos.
// 2) Idempotencia por event_id (INV-6).
// 3) Ejecuta efecto: transición de estado (§C-13.2) y/o push.
// =============================================================================
export const dynamic = 'force-dynamic';

const EventBody = z.object({
  event_id: z.string().min(1),
  action: z.enum(['start_block', 'block_warning', 'end_block', 'photo_overdue', 'briefing']),
  user_id: z.string().uuid(),
  block_id: z.string().uuid().nullable().optional(),
  ts: z.string(),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  const secret = process.env.N8N_WEBHOOK_SECRET;

  // Leer el cuerpo crudo para verificar la firma sobre los mismos bytes.
  const raw = await request.text();
  const signature = request.headers.get('x-flowday-signature') ?? '';

  if (!secret || !verifyHmacSignature(raw, signature, secret)) {
    logger.warn({ event: 'webhook.n8n.bad_signature', request_id: requestId, route: '/api/v1/webhooks/n8n' });
    return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'invalid signature' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: { code: 'bad_request', message: 'invalid json' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const parsed = EventBody.safeParse(parsedBody);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: { code: 'bad_request', message: 'invalid event' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const evt = parsed.data;
  const result = await processOnce(evt.event_id, 'n8n', async () => {
    await applyEvent(evt);
  });

  logger.info({
    event: 'webhook.n8n.ok',
    request_id: requestId,
    route: '/api/v1/webhooks/n8n',
    status: result.processed ? 200 : 200,
  });
  // 200 tanto si se procesó como si fue no-op idempotente (INV-6).
  return Response.json({ ok: true, processed: result.processed });
}

async function applyEvent(evt: z.infer<typeof EventBody>): Promise<void> {
  const svc = createServiceClient();

  // briefing no depende de un bloque concreto.
  if (evt.action === 'briefing') {
    await pushToUser(evt.user_id, {
      title: 'FlowDay',
      body: 'Buenos días. Revisa tu horario de hoy.',
      url: '/dashboard',
    });
    return;
  }

  if (!evt.block_id) return; // las demás acciones requieren bloque

  const { data: block } = await svc
    .from('blocks')
    .select('id, label, status')
    .eq('id', evt.block_id)
    .eq('user_id', evt.user_id)
    .single();
  if (!block) return; // bloque inexistente/ajeno: no-op

  switch (evt.action) {
    case 'start_block':
      if (canTransition(block.status, 'active')) {
        await svc.from('blocks').update({ status: 'active' }).eq('id', block.id);
        await pushToUser(evt.user_id, { title: 'Bloque iniciado', body: block.label, url: '/focus' });
      }
      break;
    case 'block_warning':
      // No cambia estado; solo avisa (§C-13.3 paso 3).
      await pushToUser(evt.user_id, {
        title: 'Faltan ~10 min',
        body: `Prepara tu foto: ${block.label}`,
        url: '/focus',
      });
      break;
    case 'end_block':
      if (canTransition(block.status, 'awaiting_photo')) {
        await svc.from('blocks').update({ status: 'awaiting_photo' }).eq('id', block.id);
        await pushToUser(evt.user_id, { title: 'Sube tu foto', body: block.label, url: '/focus' });
      }
      break;
    case 'photo_overdue':
      // No cambia estado (§C-13.5); solo recuerda si sigue esperando foto.
      if (block.status === 'awaiting_photo') {
        await pushToUser(evt.user_id, {
          title: 'Foto pendiente',
          body: `No olvides tu evidencia: ${block.label}`,
          url: '/focus',
        });
      }
      break;
  }
}
