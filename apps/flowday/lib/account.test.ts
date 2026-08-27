import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-15.4 (GDPR): exportación de datos y borrado de cuenta.

let mockClient: MockClient;
const remove = vi.fn(() => Promise.resolve({ data: null, error: null }));
const deleteUser = vi.fn((_id: string): Promise<{ error: unknown }> => Promise.resolve({ error: null }));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));

import { exportUserData, deleteUserAccount } from './account';

function clientWithAdmin(config = {}) {
  const c = createMockClient(config) as MockClient & {
    storage: { from: () => { remove: typeof remove } };
    auth: { admin: { deleteUser: typeof deleteUser } };
  };
  c.storage.from = vi.fn(() => ({ remove })) as never;
  (c.auth as { admin?: unknown }).admin = { deleteUser };
  return c;
}

beforeEach(() => {
  remove.mockClear();
  deleteUser.mockClear();
  deleteUser.mockResolvedValue({ error: null });
});

describe('exportUserData (§C-15.4 derecho de acceso)', () => {
  it('agrega todos los datasets del usuario en un solo objeto', async () => {
    const supabase = createMockClient({
      tableResults: {
        profiles: { data: { id: 'u1', plan: 'pro' } },
        credits: { data: { balance: 1 } },
        subscriptions: { data: null },
        blocks: { data: [{ id: 'b1' }] },
        evidence: { data: [{ id: 'e1' }] },
        habits: { data: [] },
        usage_log: { data: [{ id: 'ul1' }] },
        credit_purchases: { data: [] },
      },
    });
    const out = await exportUserData(supabase as never, 'u1');
    expect(out.profile).toEqual({ id: 'u1', plan: 'pro' });
    expect(out.blocks).toEqual([{ id: 'b1' }]);
    expect(out.usage_log).toEqual([{ id: 'ul1' }]);
    expect(out.subscription).toBeNull();
    expect(typeof out.exported_at).toBe('string');
  });
});

describe('deleteUserAccount (§C-15.4 borrado)', () => {
  it('borra fotos, registra evento no-personal y elimina el usuario de auth', async () => {
    mockClient = clientWithAdmin({
      tableResults: { evidence: { data: [{ photo_path: 'u1/b1/x.jpg' }, { photo_path: 'u1/b2/y.jpg' }] } },
    });
    await deleteUserAccount('u1');
    expect(remove).toHaveBeenCalledWith(['u1/b1/x.jpg', 'u1/b2/y.jpg']);
    const ev = mockClient.log.find((l) => l.table === 'monetization_events');
    expect(ev?.payload).toEqual({ event_type: 'account_deleted', payload: {} });
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('sin fotos: no llama a Storage.remove pero igual borra el usuario', async () => {
    mockClient = clientWithAdmin({ tableResults: { evidence: { data: [] } } });
    await deleteUserAccount('u2');
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('u2');
  });

  it('propaga el error si auth.admin.deleteUser falla', async () => {
    mockClient = clientWithAdmin({ tableResults: { evidence: { data: [] } } });
    deleteUser.mockResolvedValueOnce({ error: new Error('boom') });
    await expect(deleteUserAccount('u3')).rejects.toThrow('boom');
  });
});
