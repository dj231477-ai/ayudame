import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../../../../../tests/helpers/supabase-mock';

// SPEC §C-11.2, §C-13.2: PATCH (transiciones + edición) y DELETE (protege evidencia, INV-11).

const requireUser = vi.fn();
vi.mock('@/lib/api/respond', () => ({
  requireUser: () => requireUser(),
  ok: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data }),
  fail: (e: { httpStatus?: number; code?: string }) => ({ status: e?.httpStatus ?? 500, body: { error: { code: e?.code ?? 'internal' } } }),
}));

import { PATCH, DELETE } from './route';

const BID = 'b1';
function params() {
  return { params: Promise.resolve({ id: BID }) };
}
function patchReq(body: unknown) {
  return new Request(`https://app.test/api/v1/blocks/${BID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => requireUser.mockReset());

function ctx(current: { status: string }, updated?: Record<string, unknown>) {
  const supabase = createMockClient({
    tableResults: {
      blocks: [
        { data: current }, // SELECT status actual
        { data: { id: BID, ...current, ...updated }, error: null }, // UPDATE ... returning
      ],
    },
  }) as MockClient;
  return { userId: 'u1', locale: 'es', supabase };
}

describe('PATCH /api/v1/blocks/:id (§C-13.2)', () => {
  // D-10, §C-13.2: pending ya no va a 'active' directamente, sino a 'awaiting_start_photo'.
  it('transición válida pending→awaiting_start_photo se aplica', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'pending' }, { status: 'awaiting_start_photo' }));
    const res = (await PATCH(patchReq({ status: 'awaiting_start_photo' }), params())) as unknown as { status: number };
    expect(res.status).toBe(200);
  });

  it('transición válida awaiting_start_photo→active se aplica', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'awaiting_start_photo' }, { status: 'active' }));
    const res = (await PATCH(patchReq({ status: 'active' }), params())) as unknown as { status: number };
    expect(res.status).toBe(200);
  });

  it('transición válida awaiting_start_photo→skipped se aplica (ventana vencida)', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'awaiting_start_photo' }, { status: 'skipped' }));
    const res = (await PATCH(patchReq({ status: 'skipped' }), params())) as unknown as { status: number };
    expect(res.status).toBe(200);
  });

  it('rechaza el salto pending→active con 409 (exige la foto de inicio)', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'pending' }));
    const res = (await PATCH(patchReq({ status: 'active' }), params())) as unknown as { status: number };
    expect(res.status).toBe(409);
  });

  it('rechaza alcanzar "verified" por PATCH (solo vía verify-photo) con 409', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'awaiting_photo' }));
    const res = (await PATCH(patchReq({ status: 'verified' }), params())) as unknown as { status: number; body: { error: { code: string } } };
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('block_state_invalid');
  });

  it('rechaza transición ilegal pending→awaiting_photo con 409', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'pending' }));
    const res = (await PATCH(patchReq({ status: 'awaiting_photo' }), params())) as unknown as { status: number };
    expect(res.status).toBe(409);
  });

  it('404 si el bloque no existe', async () => {
    const supabase = createMockClient({ tableResults: { blocks: { data: null } } });
    requireUser.mockResolvedValue({ userId: 'u1', locale: 'es', supabase });
    const res = (await PATCH(patchReq({ status: 'active' }), params())) as unknown as { status: number };
    expect(res.status).toBe(404);
  });

  it('400 si el update queda vacío', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'pending' }));
    const res = (await PATCH(patchReq({}), params())) as unknown as { status: number };
    expect(res.status).toBe(400);
  });

  it('permite editar solo el label sin tocar el estado', async () => {
    requireUser.mockResolvedValue(ctx({ status: 'active' }, { label: 'Nuevo' }));
    const res = (await PATCH(patchReq({ label: 'Nuevo' }), params())) as unknown as { status: number };
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/v1/blocks/:id (INV-11)', () => {
  it('borra el bloque si no tiene evidencia', async () => {
    const supabase = createMockClient({ tableResults: { evidence: { data: [] } } });
    requireUser.mockResolvedValue({ userId: 'u1', locale: 'es', supabase });
    const res = (await DELETE(new Request('https://app.test/x'), params())) as unknown as { status: number; body: { deleted: boolean } };
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('rechaza borrar un bloque con evidencia histórica (409, INV-11)', async () => {
    const supabase = createMockClient({ tableResults: { evidence: { data: [{ id: 'e1' }] } } });
    requireUser.mockResolvedValue({ userId: 'u1', locale: 'es', supabase });
    const res = (await DELETE(new Request('https://app.test/x'), params())) as unknown as { status: number };
    expect(res.status).toBe(409);
  });
});
