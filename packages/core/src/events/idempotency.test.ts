import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from '../test-utils/supabase-mock';

// SPEC §C-12.4, INV-6: idempotencia claim-first de eventos.

let mockClient: ReturnType<typeof createMockClient>;
vi.mock('../auth', () => ({ createServiceClient: () => mockClient }));

import { processOnce, hasProcessed } from './idempotency';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('processOnce (INV-6)', () => {
  it('primer evento: reclama, ejecuta el efecto y devuelve processed:true', async () => {
    mockClient = createMockClient({ tableResults: { processed_events: { error: null } } });
    const effect = vi.fn(() => Promise.resolve());
    const res = await processOnce('evt_1', 'stripe', effect);
    expect(res).toEqual({ processed: true });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(mockClient.log.find((l) => l.op === 'insert' && l.table === 'processed_events')).toBeDefined();
  });

  it('evento duplicado (conflicto de PK): NO ejecuta el efecto, processed:false', async () => {
    mockClient = createMockClient({ tableResults: { processed_events: { error: { code: '23505' } } } });
    const effect = vi.fn(() => Promise.resolve());
    const res = await processOnce('evt_1', 'stripe', effect);
    expect(res).toEqual({ processed: false });
    expect(effect).not.toHaveBeenCalled();
  });

  it('si el efecto lanza: libera el claim (delete) y propaga el error', async () => {
    mockClient = createMockClient({ tableResults: { processed_events: { error: null } } });
    const effect = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(processOnce('evt_2', 'n8n', effect)).rejects.toThrow('boom');
    expect(mockClient.log.find((l) => l.op === 'delete' && l.table === 'processed_events')).toBeDefined();
  });
});

describe('hasProcessed', () => {
  it('true si existe la fila, false si no', async () => {
    mockClient = createMockClient({ tableResults: { processed_events: { data: { event_id: 'e' } } } });
    expect(await hasProcessed('e')).toBe(true);
    mockClient = createMockClient({ tableResults: { processed_events: { data: null } } });
    expect(await hasProcessed('e')).toBe(false);
  });
});
