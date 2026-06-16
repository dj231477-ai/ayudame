import { constructWebhookEvent, type Stripe } from '@flowday/core/billing/stripe';
import { processOnce } from '@flowday/core/events/idempotency';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { handleStripeEvent } from '@/lib/billing';

// =============================================================================
// Webhook Stripe → app  [NORMATIVO — SPEC §C-12.4]
// 1) Verifica firma (INV-5) — inválida ⇒ 401, sin efectos.
// 2) Idempotencia por event.id (INV-6).
// 3) Aplica efecto (créditos / suscripción / refund).
// =============================================================================
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = newRequestId();
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(raw, signature);
  } catch {
    logger.warn({ event: 'webhook.stripe.bad_signature', request_id: requestId, route: '/api/v1/billing/webhook' });
    return new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'invalid signature' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const result = await processOnce(event.id, 'stripe', async () => {
    await handleStripeEvent(event);
  });

  logger.info({
    event: 'webhook.stripe.ok',
    request_id: requestId,
    route: '/api/v1/billing/webhook',
  });
  return Response.json({ received: true, processed: result.processed });
}
