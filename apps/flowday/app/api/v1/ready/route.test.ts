import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../../../../tests/helpers/supabase-mock';

// SPEC §C-17.3: readiness. 200 si Supabase responde; 503 si no.

let mockClient: MockClient;
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));

import { GET } from './route';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('GET /api/v1/ready (§C-17.3)', () => {
  it('200 ready cuando la consulta a feature_flags responde sin error', async () => {
    mockClient = createMockClient({ tableResults: { feature_flags: { data: [{ key: 'x' }], error: null } } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });

  it('503 unavailable cuando Supabase devuelve error', async () => {
    mockClient = createMockClient({ tableResults: { feature_flags: { data: null, error: { message: 'down' } } } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });
});
