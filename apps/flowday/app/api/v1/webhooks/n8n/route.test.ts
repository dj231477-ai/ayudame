import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../../../../../tests/helpers/supabase-mock';

// SPEC §C-12.3: webhook n8n. Firma HMAC (INV-5), idempotencia (INV-6), transiciones (§C-13.2).

let mockClient: MockClient;
const verifyHmacSignature = vi.fn();
const processOnce = vi.fn();
const pushToUser = vi.fn((..._a: unknown[]) => Promise.resolve());

vi.mock('@flowday/core/security/hmac', () => ({
  verifyHmacSignature: (raw: string, sig: string, secret: string) => verifyHmacSignature(raw, sig, secret),
}));
vi.mock('@flowday/core/events/idempotency', () => ({
  processOnce: (id: string, source: string, effect: () => Promise<void>) => processOnce(id, source, effect),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));
vi.mock('@/lib/push/send', () => ({ pushToUser: (userId: string, payload: unknown) => pushToUser(userId, payload) }));

import { POST } from './route';

const UID = '11111111-1111-1111-1111-111111111111';
const BID = '22222222-2222-2222-2222-222222222222';

function req(body: unknown, sig = 'sig') {
  return new Request('https://app.test/api/v1/webhooks/n8n', {
    method: 'POST',
    headers: { 'x-flowday-signature': sig },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validEvent(over: Record<string, unknown> = {}) {
  return { event_id: 'e1', action: 'start_block', user_id: UID, block_id: BID, ts: '2026-06-13T10:00:00Z', ...over };
}

beforeEach(() => {
  mockClient = createMockClient();
  process.env.N8N_WEBHOOK_SECRET = 'secret';
  verifyHmacSignature.mockReset().mockReturnValue(true);
  pushToUser.mockClear();
  // Por defecto: ejecuta el efecto y marca processed.
  processOnce.mockReset().mockImplementation(async (_id: string, _src: string, effect: () => Promise<void>) => {
    await effect();
    return { processed: true };
  });
});

describe('POST /api/v1/webhooks/n8n (§C-12.3)', () => {
  it('firma inválida ⇒ 401 sin efectos (INV-5)', async () => {
    verifyHmacSignature.mockReturnValue(false);
    const res = await POST(req(validEvent()));
    expect(res.status).toBe(401);
    expect(processOnce).not.toHaveBeenCalled();
  });

  it('JSON inválido ⇒ 400', async () => {
    const res = await POST(req('{not json'));
    expect(res.status).toBe(400);
  });

  it('evento que no valida el esquema ⇒ 400', async () => {
    const res = await POST(req({ event_id: 'e1', action: 'no_existe', user_id: UID, ts: 't' }));
    expect(res.status).toBe(400);
  });

  // D-10, §C-13.2: pending -> awaiting_start_photo. 'active' solo llega tras la foto de inicio.
  it('start_block sobre bloque pending ⇒ transiciona a awaiting_start_photo y notifica', async () => {
    mockClient = createMockClient({ tableResults: { blocks: { data: { id: BID, label: 'X', status: 'pending' } } } });
    const res = await POST(req(validEvent({ action: 'start_block' })));
    expect(res.status).toBe(200);
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')?.payload).toEqual({
      status: 'awaiting_start_photo',
    });
    expect(pushToUser).toHaveBeenCalledTimes(1);
  });

  it('start_block sobre bloque ya active ⇒ no-op, sin update ni push (§C-13.2)', async () => {
    mockClient = createMockClient({ tableResults: { blocks: { data: { id: BID, label: 'X', status: 'active' } } } });
    const res = await POST(req(validEvent({ action: 'start_block' })));
    expect(res.status).toBe(200);
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')).toBeUndefined();
    expect(pushToUser).not.toHaveBeenCalled();
  });

  it('end_block sobre bloque active ⇒ transiciona a awaiting_photo', async () => {
    mockClient = createMockClient({ tableResults: { blocks: { data: { id: BID, label: 'X', status: 'active' } } } });
    await POST(req(validEvent({ action: 'end_block' })));
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')?.payload).toEqual({
      status: 'awaiting_photo',
    });
  });

  it('block_warning ⇒ solo notifica, sin cambiar estado', async () => {
    mockClient = createMockClient({ tableResults: { blocks: { data: { id: BID, label: 'X', status: 'active' } } } });
    await POST(req(validEvent({ action: 'block_warning' })));
    expect(mockClient.log.find((l) => l.op === 'update')).toBeUndefined();
    expect(pushToUser).toHaveBeenCalledTimes(1);
  });

  it('briefing ⇒ push sin requerir bloque', async () => {
    await POST(req(validEvent({ action: 'briefing', block_id: null })));
    expect(pushToUser).toHaveBeenCalledTimes(1);
  });

  it('bloque inexistente/ajeno ⇒ no-op (200, sin update)', async () => {
    mockClient = createMockClient({ tableResults: { blocks: { data: null } } });
    const res = await POST(req(validEvent({ action: 'start_block' })));
    expect(res.status).toBe(200);
    expect(mockClient.log.find((l) => l.op === 'update')).toBeUndefined();
  });

  it('evento duplicado ⇒ no reejecuta el efecto (INV-6)', async () => {
    processOnce.mockResolvedValue({ processed: false });
    const res = await POST(req(validEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: false });
  });
});
