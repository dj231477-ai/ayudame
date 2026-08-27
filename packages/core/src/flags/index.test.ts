import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from '../test-utils/supabase-mock';

// SPEC §C-9.7, §C-19.5: feature flags (tabla interna, escritura registra evento).

let mockClient: ReturnType<typeof createMockClient>;
vi.mock('../auth', () => ({ createServiceClient: () => mockClient }));

import { getFlag, isFlagEnabled, setFlag } from './index';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('getFlag / isFlagEnabled', () => {
  it('getFlag devuelve el valor almacenado', async () => {
    mockClient = createMockClient({ tableResults: { feature_flags: { data: { value: true } } } });
    expect(await getFlag('pro_tier_active')).toBe(true);
  });

  it('getFlag devuelve null si no existe', async () => {
    mockClient = createMockClient({ tableResults: { feature_flags: { data: null } } });
    expect(await getFlag('x')).toBeNull();
  });

  it('isFlagEnabled true solo si el valor es exactamente true', async () => {
    mockClient = createMockClient({ tableResults: { feature_flags: { data: { value: true } } } });
    expect(await isFlagEnabled('x')).toBe(true);
    mockClient = createMockClient({ tableResults: { feature_flags: { data: { value: 'yes' } } } });
    expect(await isFlagEnabled('x')).toBe(false);
  });
});

describe('setFlag', () => {
  it('hace upsert del flag y registra un evento en monetization_events', async () => {
    await setFlag('team_tier_active', true);
    expect(mockClient.log.find((l) => l.op === 'upsert' && l.table === 'feature_flags')).toBeDefined();
    const ev = mockClient.log.find((l) => l.op === 'insert' && l.table === 'monetization_events');
    expect((ev?.payload as { event_type: string }).event_type).toBe('flag_set');
  });
});
