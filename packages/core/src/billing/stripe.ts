// =============================================================================
// Cliente Stripe + helpers  [SPEC §C-5.2, §C-9, §C-12.4, AR-5]
// Stripe es la autoridad del estado de suscripción y compras. Backend-only (INV-4).
// =============================================================================

import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  if (!client) client = new Stripe(key);
  return client;
}

/** Verifica y construye el evento de webhook (INV-5). Lanza si la firma es inválida. */
export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET missing');
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}

export type { Stripe };
