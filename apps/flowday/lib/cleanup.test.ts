import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-15.3, §C-14.4: limpieza por lotes + barrido de objetos huérfanos de Storage.

let mockClient: MockClient;
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));

import { runCleanup } from './cleanup';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('runCleanup (§C-15.3)', () => {
  it('sin usuarios: no hace nada', async () => {
    mockClient = createMockClient({ tableResults: { profiles: { data: [] } } });
    const res = await runCleanup();
    expect(res).toEqual({ usersProcessed: 0, photosRemoved: 0, rowsDeleted: 0 });
  });

  it('borra evidencia vencida (Storage + filas) y barre huérfanos de un usuario', async () => {
    const old = '2020-01-01T00:00:00Z';
    mockClient = createMockClient({
      tableResults: {
        // página 1 con un usuario, página 2 vacía (corta el bucle)
        profiles: [{ data: [{ id: 'u1', plan: 'free' }] }, { data: [] }],
        // evidencia vencida (para borrar) y luego, en removeOrphanPhotos, la evidencia a conservar
        evidence: [{ data: [{ photo_path: 'u1/b1/old.jpg' }] }, { data: [] }],
        verification_queue: { data: [] },
      },
      storageList: {
        // nivel 1: carpeta de bloque; nivel 2: un fichero huérfano antiguo
        u1: { data: [{ name: 'b1', id: null }] },
        'u1/b1': { data: [{ name: 'orphan.jpg', id: 'f1', created_at: old }] },
      },
    });

    const res = await runCleanup();
    expect(res.usersProcessed).toBe(1);
    // 1 foto de evidencia vencida + 1 huérfana
    expect(res.photosRemoved).toBe(2);
    expect(res.rowsDeleted).toBe(1);
    // Verifica que se borró la evidencia vencida y se ejecutaron los deletes de retención.
    const deletes = mockClient.log.filter((l) => l.op === 'delete');
    expect(deletes.map((d) => d.table)).toEqual(expect.arrayContaining(['evidence', 'usage_log', 'blocks']));
    // Storage.remove llamado con la foto vencida y con la huérfana.
    expect(mockClient.removed.flat()).toEqual(expect.arrayContaining(['u1/b1/old.jpg', 'u1/b1/orphan.jpg']));
  });

  it('no borra objetos recientes (<24h) en el barrido de huérfanos', async () => {
    const recent = new Date().toISOString();
    mockClient = createMockClient({
      tableResults: {
        profiles: [{ data: [{ id: 'u1', plan: 'free' }] }, { data: [] }],
        evidence: [{ data: [] }, { data: [] }],
        verification_queue: { data: [] },
      },
      storageList: {
        u1: { data: [{ name: 'b1', id: null }] },
        'u1/b1': { data: [{ name: 'fresh.jpg', id: 'f1', created_at: recent }] },
      },
    });
    const res = await runCleanup();
    expect(res.photosRemoved).toBe(0);
    expect(mockClient.removed.flat()).not.toContain('u1/b1/fresh.jpg');
  });
});
