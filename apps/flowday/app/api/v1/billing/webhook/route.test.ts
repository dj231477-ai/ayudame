import { describe, it, expect, beforeEach, vi } from 'vitest';

// SPEC §C-12.4: POST /api/v1/billing/webhook. Verifica firma (INV-5) + idempotencia (INV-6).

const constructWebhookEvent = vi.fn();
const processOnce = vi.fn();
const handleStripeEvent = vi.fn((_e: unknown) => Promise.resolve());

vi.mock('@flowday/core/billing/stripe', () => ({
  constructWebhookEvent: (payload: string, sig: string) => constructWebhookEvent(payload, sig),
}));
vi.mock('@flowday/core/events/idempotency', () => ({
  processOnce: (id: string, source: string, effect: () => Promise<void>) => processOnce(id, source, effect),
}));
vi.mock('@/lib/billing', () => ({ handleStripeEvent: (e: unknown) => handleStripeEvent(e) }));

import { POST } from './route';

function req(headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/v1/billing/webhook', {
    method: 'POST',
    headers,
    body: 'raw-payload',
  });
}

beforeEach(() => {
  constructWebhookEvent.mockReset();
  processOnce.mockReset();
  handleStripeEvent.mockClear();
});

describe('POST /api/v1/billing/webhook (§C-12.4)', () => {
  it('firma inválida ⇒ 401 sin efectos (INV-5)', async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(req({ 'stripe-signature': 'bad' }));
    expect(res.status).toBe(401);
    expect(processOnce).not.toHaveBeenCalled();
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it('firma válida ⇒ procesa una vez (INV-6) y responde received', async () => {
    constructWebhookEvent.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' });
    processOnce.mockImplementation(async (_id: string, _src: string, effect: () => Promise<void>) => {
      await effect();
      return { processed: true };
    });
    const res = await POST(req({ 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, processed: true });
    expect(handleStripeEvent).toHaveBeenCalledTimes(1);
    expect(processOnce).toHaveBeenCalledWith('evt_1', 'stripe', expect.any(Function));
  });

  it('evento duplicado ⇒ no reejecuta el efecto, responde processed:false', async () => {
    constructWebhookEvent.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' });
    processOnce.mockResolvedValue({ processed: false });
    const res = await POST(req({ 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, processed: false });
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });
});
