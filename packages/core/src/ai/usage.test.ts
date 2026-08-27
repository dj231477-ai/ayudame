import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from '../test-utils/supabase-mock';

// SPEC §C-10.3, F2, E4: contabilidad de uso de IA por proveedor/día.

let mockClient: ReturnType<typeof createMockClient>;
vi.mock('../auth', () => ({ createServiceClient: () => mockClient }));

import { getDailyUsage, incrementUsage, PROVIDER_LIMIT_UNIT } from './usage';

beforeEach(() => {
  mockClient = createMockClient();
});

describe('PROVIDER_LIMIT_UNIT (§C-10.3)', () => {
  it('cerebras se limita por tokens; el resto por requests', () => {
    expect(PROVIDER_LIMIT_UNIT.cerebras).toBe('tokens');
    expect(PROVIDER_LIMIT_UNIT.gemini).toBe('requests');
    expect(PROVIDER_LIMIT_UNIT.groq).toBe('requests');
    expect(PROVIDER_LIMIT_UNIT.minimax).toBe('requests');
  });
});

describe('getDailyUsage', () => {
  it('ausencia de fila => 0', async () => {
    mockClient = createMockClient({ tableResults: { ai_daily_usage: { data: null } } });
    expect(await getDailyUsage('gemini')).toBe(0);
  });

  it('proveedor por requests devuelve request_count', async () => {
    mockClient = createMockClient({ tableResults: { ai_daily_usage: { data: { request_count: 7, token_count: 999 } } } });
    expect(await getDailyUsage('groq')).toBe(7);
  });

  it('cerebras devuelve token_count (unidad tokens)', async () => {
    mockClient = createMockClient({ tableResults: { ai_daily_usage: { data: { request_count: 7, token_count: 12345 } } } });
    expect(await getDailyUsage('cerebras')).toBe(12345);
  });
});

describe('incrementUsage (E4)', () => {
  it('llama al RPC increment_ai_usage redondeando tokens a >= 0', async () => {
    await incrementUsage('gemini', 12.7);
    const rpc = mockClient.log.find((l) => l.op === 'rpc' && l.name === 'increment_ai_usage');
    expect(rpc?.args).toEqual({ p_provider: 'gemini', p_tokens: 13 });
  });

  it('tokens negativos se acotan a 0', async () => {
    await incrementUsage('groq', -5);
    const rpc = mockClient.log.find((l) => l.op === 'rpc' && l.name === 'increment_ai_usage');
    expect((rpc?.args as { p_tokens: number }).p_tokens).toBe(0);
  });

  it('no propaga si el RPC falla (no es ruta crítica)', async () => {
    mockClient = createMockClient({ rpcResults: { increment_ai_usage: { error: { code: 'x' } } } });
    await expect(incrementUsage('gemini', 1)).resolves.toBeUndefined();
  });
});
