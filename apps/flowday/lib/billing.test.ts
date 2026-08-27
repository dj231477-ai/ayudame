import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-9.8, §C-11.4, §C-12.4. Orquestación Stripe: checkout, portal y efectos de webhook.
// No toca Stripe ni Supabase reales: ambos están mockeados.

let mockClient: MockClient;
const sessionsCreate = vi.fn();
const portalCreate = vi.fn();

vi.mock('@flowday/core/billing/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mockClient,
}));

import { createCheckout, createPortal, handleStripeEvent } from './billing';

const ENV = {
  STRIPE_PRICE_ID_STARTER: 'price_starter',
  STRIPE_PRICE_ID_GROWTH: 'price_growth',
  STRIPE_PRICE_ID_POWER: 'price_power',
  STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro',
  STRIPE_PRICE_ID_TEAM: 'price_team',
  NEXT_PUBLIC_APP_URL: 'https://app.test',
};

beforeEach(() => {
  mockClient = createMockClient();
  sessionsCreate.mockReset();
  portalCreate.mockReset();
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
});

function stripeEvent(type: string, object: Record<string, unknown>) {
  return { id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } } as never;
}

describe('createCheckout (§C-9.8)', () => {
  it('paquete: modo payment, price y metadata correctos', async () => {
    sessionsCreate.mockResolvedValue({ url: 'https://stripe/checkout/pkg' });
    const url = await createCheckout({ kind: 'package', id: 'growth', userId: 'u1', email: 'a@b.com' });
    expect(url).toBe('https://stripe/checkout/pkg');
    const [params] = sessionsCreate.mock.calls[0]!;
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price).toBe('price_growth');
    expect(params.metadata).toMatchObject({ user_id: 'u1', kind: 'package', package: 'growth' });
    expect(params.automatic_tax).toEqual({ enabled: true }); // §C-21 Stripe Tax
  });

  it('suscripción team: fuerza mínimo 3 asientos', async () => {
    sessionsCreate.mockResolvedValue({ url: 'https://stripe/sub' });
    await createCheckout({ kind: 'subscription', id: 'team', seats: 1, userId: 'u2' });
    const [params] = sessionsCreate.mock.calls[0]!;
    expect(params.mode).toBe('subscription');
    expect(params.line_items[0].quantity).toBe(3);
    expect(params.metadata.seats).toBe('3');
  });

  it('propaga el idempotencyKey como opción a Stripe', async () => {
    sessionsCreate.mockResolvedValue({ url: 'https://x' });
    await createCheckout({ kind: 'package', id: 'starter', userId: 'u3', idempotencyKey: 'idem-1' });
    expect(sessionsCreate.mock.calls[0]![1]).toEqual({ idempotencyKey: 'idem-1' });
  });

  it('lanza si el price no está configurado', async () => {
    delete process.env.STRIPE_PRICE_ID_POWER;
    await expect(createCheckout({ kind: 'package', id: 'power', userId: 'u4' })).rejects.toThrow(
      /stripe_price_not_configured/,
    );
  });

  it('lanza si Stripe no devuelve url', async () => {
    sessionsCreate.mockResolvedValue({ url: null });
    await expect(createCheckout({ kind: 'package', id: 'starter', userId: 'u5' })).rejects.toThrow(
      'stripe_no_session_url',
    );
  });
});

describe('createPortal', () => {
  it('crea sesión de portal con el customer guardado', async () => {
    mockClient = createMockClient({ tableResults: { subscriptions: { data: { stripe_customer_id: 'cus_1' } } } });
    portalCreate.mockResolvedValue({ url: 'https://stripe/portal' });
    const url = await createPortal('u1');
    expect(url).toBe('https://stripe/portal');
    expect(portalCreate.mock.calls[0]![0].customer).toBe('cus_1');
  });

  it('lanza si el usuario no tiene customer de Stripe', async () => {
    mockClient = createMockClient({ tableResults: { subscriptions: { data: null } } });
    await expect(createPortal('u1')).rejects.toThrow('no_stripe_customer');
  });
});

describe('handleStripeEvent (§C-12.4)', () => {
  it('checkout package: acredita créditos vía record_credit_purchase (idempotente por payment_intent)', async () => {
    await handleStripeEvent(
      stripeEvent('checkout.session.completed', {
        id: 'cs_1',
        payment_intent: 'pi_1',
        amount_total: 900,
        metadata: { user_id: 'u1', kind: 'package', package: 'growth' },
      }),
    );
    const rpc = mockClient.log.find((l) => l.op === 'rpc' && l.name === 'record_credit_purchase');
    expect(rpc).toBeDefined();
    expect(rpc?.args).toMatchObject({
      p_user_id: 'u1',
      p_package: 'growth',
      p_amount_usd: 9,
      p_credits: 4.5,
      p_stripe_payment_id: 'pi_1',
    });
  });

  it('checkout package con paquete desconocido: no acredita', async () => {
    await handleStripeEvent(
      stripeEvent('checkout.session.completed', {
        id: 'cs_x',
        metadata: { user_id: 'u1', kind: 'package', package: 'no_existe' },
      }),
    );
    expect(mockClient.log.some((l) => l.op === 'rpc')).toBe(false);
  });

  it('checkout subscription pro: upsert subscription, sube plan y acredita stipend Pro ($1)', async () => {
    await handleStripeEvent(
      stripeEvent('checkout.session.completed', {
        id: 'cs_2',
        customer: 'cus_2',
        subscription: 'sub_2',
        metadata: { user_id: 'u2', kind: 'subscription', plan: 'pro', seats: '1' },
      }),
    );
    const upsert = mockClient.log.find((l) => l.op === 'upsert' && l.table === 'subscriptions');
    expect(upsert?.payload).toMatchObject({ user_id: 'u2', plan: 'pro', status: 'active', seats: 1 });
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'profiles')?.payload).toEqual({ plan: 'pro' });
    const credit = mockClient.log.find((l) => l.op === 'rpc' && l.name === 'add_credits');
    expect(credit?.args).toEqual({ p_user_id: 'u2', p_amount: 1 });
  });

  it('checkout subscription team: stipend = $2 por asiento', async () => {
    await handleStripeEvent(
      stripeEvent('checkout.session.completed', {
        id: 'cs_3',
        metadata: { user_id: 'u3', kind: 'subscription', plan: 'team', seats: '3' },
      }),
    );
    expect(mockClient.log.find((l) => l.op === 'rpc' && l.name === 'add_credits')?.args).toEqual({
      p_user_id: 'u3',
      p_amount: 6,
    });
  });

  it('sin user_id en metadata: no hace nada', async () => {
    await handleStripeEvent(stripeEvent('checkout.session.completed', { id: 'cs_4', metadata: {} }));
    expect(mockClient.log).toHaveLength(0);
  });

  it('subscription.deleted: cancela suscripción y baja el plan a free', async () => {
    await handleStripeEvent(
      stripeEvent('customer.subscription.deleted', { metadata: { user_id: 'u5' }, status: 'canceled' }),
    );
    expect(mockClient.log.find((l) => l.table === 'subscriptions')?.payload).toEqual({ status: 'canceled' });
    expect(mockClient.log.find((l) => l.table === 'profiles')?.payload).toEqual({ plan: 'free' });
  });

  it('charge.refunded: marca la compra como refunded', async () => {
    await handleStripeEvent(stripeEvent('charge.refunded', { payment_intent: 'pi_9' }));
    const upd = mockClient.log.find((l) => l.table === 'credit_purchases');
    expect(upd?.op).toBe('update');
    expect(upd?.payload).toEqual({ status: 'refunded' });
  });

  it('invoice.payment_succeeded de renovación: acredita stipend del plan guardado', async () => {
    mockClient = createMockClient({
      tableResults: { subscriptions: { data: { user_id: 'u6', plan: 'pro', seats: 1 } } },
    });
    await handleStripeEvent(
      stripeEvent('invoice.payment_succeeded', { billing_reason: 'subscription_cycle', subscription: 'sub_6' }),
    );
    expect(mockClient.log.find((l) => l.op === 'rpc' && l.name === 'add_credits')?.args).toEqual({
      p_user_id: 'u6',
      p_amount: 1,
    });
  });

  it('invoice.payment_succeeded que NO es renovación: no acredita (el alta ya lo hizo)', async () => {
    await handleStripeEvent(
      stripeEvent('invoice.payment_succeeded', { billing_reason: 'subscription_create', subscription: 'sub_7' }),
    );
    expect(mockClient.log.some((l) => l.op === 'rpc')).toBe(false);
  });

  it('evento no manejado: no-op', async () => {
    await handleStripeEvent(stripeEvent('payment_intent.created', {}));
    expect(mockClient.log).toHaveLength(0);
  });
});
