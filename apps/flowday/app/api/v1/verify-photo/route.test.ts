import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@flowday/core/errors';
import { createMockClient } from '../../../../tests/helpers/supabase-mock';

// SPEC §C-11.3: POST /api/v1/verify-photo (orden NORMATIVO).

const requireUser = vi.fn();
const verifyPhoto = vi.fn();
const limitUser = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('@/lib/api/respond', () => ({
  requireUser: () => requireUser(),
  ok: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: data }),
  fail: (e: { httpStatus?: number; code?: string }) => ({ status: e?.httpStatus ?? 500, body: { error: { code: e?.code ?? 'internal' } } }),
}));
vi.mock('@/lib/verify-photo', () => ({ verifyPhoto: (...a: unknown[]) => verifyPhoto(...a) }));
vi.mock('@flowday/core/ratelimit', () => ({ limitUser: () => limitUser() }));

import { POST } from './route';

const UID = '11111111-1111-1111-1111-111111111111';
const BID = '22222222-2222-2222-2222-222222222222';

function req(body: unknown) {
  return new Request('https://app.test/api/v1/verify-photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWithBlock(status: string, taskId: string | null = null) {
  const supabase = createMockClient({
    tableResults: { blocks: { data: { id: BID, type: 'deep', label: 'X', status, task_id: taskId } } },
  });
  return { userId: UID, locale: 'es', supabase };
}

beforeEach(() => {
  requireUser.mockReset();
  verifyPhoto.mockReset().mockResolvedValue({ verified: true, confidence: 0.9, message: 'ok', balance: 1 });
  limitUser.mockClear().mockResolvedValue({ success: true });
});

describe('POST /api/v1/verify-photo (§C-11.3)', () => {
  it('flujo feliz: bloque en awaiting_photo ⇒ verifica y responde resultado', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg` }))) as unknown as {
      status: number;
      body: { verified: boolean };
    };
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(verifyPhoto).toHaveBeenCalledTimes(1);
  });

  it('rechaza photo_path de otro usuario (S4) con 400, sin verificar', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(req({ block_id: BID, photo_path: `otrouser/${BID}/x.jpg` }))) as unknown as { status: number };
    expect(res.status).toBe(400);
    expect(verifyPhoto).not.toHaveBeenCalled();
  });

  it('bloque en estado inválido ⇒ 409 block_state_invalid', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('pending'));
    const res = (await POST(req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg` }))) as unknown as { status: number };
    expect(res.status).toBe(409);
    expect(verifyPhoto).not.toHaveBeenCalled();
  });

  it('body inválido (block_id no uuid) ⇒ 400', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(req({ block_id: 'nope', photo_path: 'x' }))) as unknown as { status: number };
    expect(res.status).toBe(400);
  });

  it('rate limit excedido ⇒ 429', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    limitUser.mockResolvedValue({ success: false });
    const res = (await POST(req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg` }))) as unknown as { status: number };
    expect(res.status).toBe(429);
  });

  it('401 si no hay sesión', async () => {
    requireUser.mockImplementationOnce(async () => {
      throw new AppError('unauthorized');
    });
    const res = (await POST(req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg` }))) as unknown as { status: number };
    expect(res.status).toBe(401);
  });

  it('propaga task_id y phase="end" por defecto a verifyPhoto (D-13)', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo', 'lista1:tarea1'));
    await POST(req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg` }));
    expect(verifyPhoto).toHaveBeenCalledWith(expect.objectContaining({ phase: 'end', taskId: 'lista1:tarea1' }));
  });

  it('acepta el prefijo del bucket en photo_path y lo normaliza', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(
      req({ block_id: BID, photo_path: `evidence-photos/${UID}/${BID}/x.jpg` }),
    )) as unknown as { status: number };
    expect(res.status).toBe(200);
    expect(verifyPhoto).toHaveBeenCalledWith(expect.objectContaining({ photoPath: `${UID}/${BID}/x.jpg` }));
  });
});

// D-10, §C-11.3: cada fase exige el estado que le corresponde.
describe('POST /api/v1/verify-photo con phase="start" (D-10)', () => {
  it('bloque en awaiting_start_photo ⇒ verifica con phase="start"', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_start_photo'));
    const res = (await POST(
      req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg`, phase: 'start' }),
    )) as unknown as { status: number };
    expect(res.status).toBe(200);
    expect(verifyPhoto).toHaveBeenCalledWith(expect.objectContaining({ phase: 'start' }));
  });

  it('phase="start" sobre un bloque en awaiting_photo ⇒ 409', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(
      req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg`, phase: 'start' }),
    )) as unknown as { status: number };
    expect(res.status).toBe(409);
    expect(verifyPhoto).not.toHaveBeenCalled();
  });

  it('phase="end" sobre un bloque en awaiting_start_photo ⇒ 409', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_start_photo'));
    const res = (await POST(
      req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg`, phase: 'end' }),
    )) as unknown as { status: number };
    expect(res.status).toBe(409);
  });

  it('phase desconocida ⇒ 400', async () => {
    requireUser.mockResolvedValue(ctxWithBlock('awaiting_photo'));
    const res = (await POST(
      req({ block_id: BID, photo_path: `${UID}/${BID}/x.jpg`, phase: 'middle' }),
    )) as unknown as { status: number };
    expect(res.status).toBe(400);
  });
});
