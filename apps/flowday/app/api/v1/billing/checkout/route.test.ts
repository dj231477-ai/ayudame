import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@flowday/core/errors';

// SPEC §C-11.4: POST /api/v1/billing/checkout.

const requireUser = vi.fn();
const createCheckout = vi.fn();
const limitUser = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('@/lib/api/respond', () => ({
  requireUser: () => requireUser(),
  ok: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data }),
  fail: (e: { httpStatus?: number; code?: string }) => ({ status: e?.httpStatus ?? 500, body: { error: { code: e?.code ?? 'internal' } } }),
}));
vi.mock('@/lib/billing', () => ({ createCheckout: (...a: unknown[]) => createCheckout(...a) }));
vi.mock('@flowday/core/ratelimit', () => ({ limitUser: () => limitUser() }));

import { POST } from './route';

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/v1/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue({ userId: 'u1', email: 'a@b.com', locale: 'es' });
  createCheckout.mockReset().mockResolvedValue('https://stripe/checkout');
  limitUser.mockClear().mockResolvedValue({ success: true });
});

describe('POST /api/v1/billing/checkout (§C-11.4)', () => {
  it('crea checkout y devuelve la url, propagando el idempotency-key', async () => {
    const res = (await POST(req({ kind: 'package', id: 'growth' }, { 'idempotency-key': 'k1' }))) as unknown as {
      status: number;
      body: { url: string };
    };
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://stripe/checkout');
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'package', id: 'growth', userId: 'u1', idempotencyKey: 'k1' }),
    );
  });

  it('400 si el body es inválido', async () => {
    const res = (await POST(req({ kind: 'invalid' }))) as unknown as { status: number };
    expect(res.status).toBe(400);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('429 si el rate limit se excede', async () => {
    limitUser.mockResolvedValue({ success: false });
    const res = (await POST(req({ kind: 'package', id: 'growth' }))) as unknown as { status: number };
    expect(res.status).toBe(429);
  });

  it('401 si no hay sesión', async () => {
    requireUser.mockImplementationOnce(async () => {
      throw new AppError('unauthorized');
    });
    const res = (await POST(req({ kind: 'package', id: 'growth' }))) as unknown as { status: number };
    expect(res.status).toBe(401);
  });
});
