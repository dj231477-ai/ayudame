import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@flowday/core/errors';
import { createMockClient } from '../../../../tests/helpers/supabase-mock';

// SPEC §C-11.4: GET /api/v1/credits.

const requireUser = vi.fn();
vi.mock('@/lib/api/respond', () => ({
  requireUser: () => requireUser(),
  ok: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data }),
  fail: (e: { httpStatus?: number; code?: string }) => ({ status: e?.httpStatus ?? 500, body: { error: { code: e?.code ?? 'internal' } } }),
}));

import { GET } from './route';

beforeEach(() => requireUser.mockReset());

describe('GET /api/v1/credits (§C-11.4)', () => {
  it('devuelve saldo y créditos para mostrar', async () => {
    const supabase = createMockClient({ tableResults: { credits: { data: { balance: 0.5, total_purchased: 1, total_spent: 0.5 } } } });
    requireUser.mockResolvedValue({ userId: 'u1', locale: 'es', supabase });
    const res = (await GET()) as unknown as { status: number; body: Record<string, number> };
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0.5);
    expect(res.body.credits_display).toBe(50); // $0.5 / $0.01
  });

  it('saldo 0 si no hay fila de créditos', async () => {
    const supabase = createMockClient({ tableResults: { credits: { data: null } } });
    requireUser.mockResolvedValue({ userId: 'u1', locale: 'es', supabase });
    const res = (await GET()) as unknown as { body: Record<string, number> };
    expect(res.body.balance).toBe(0);
  });

  it('propaga 401 si no hay sesión', async () => {
    requireUser.mockImplementationOnce(async () => {
      throw new AppError('unauthorized');
    });
    const res = (await GET()) as unknown as { status: number };
    expect(res.status).toBe(401);
  });
});
