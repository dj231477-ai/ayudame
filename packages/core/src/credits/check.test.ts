import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../errors';

// Mock de createServiceClient para controlar la DB sin red. SPEC §C-18.2.
vi.mock('../auth', () => ({ createServiceClient: vi.fn() }));
vi.mock('../observability/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { createServiceClient } from '../auth';
import { checkAndDeductCredits, refundCredits } from './check';
import { ACTION_COSTS } from './pricing';

const mockClient = vi.mocked(createServiceClient);

function makeDb(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn();
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) });
  return {
    rpc,
    from: vi.fn().mockReturnValue({ insert, ...overrides }),
    _rpc: rpc,
    _insert: insert,
  };
}

describe('checkAndDeductCredits (INV-2, §C-9.5, §C-14.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve allowed:true con saldo y usageLogId cuando hay créditos', async () => {
    const db = makeDb();
    const logId = 'log-abc';
    const newBalance = 0.094;
    db._rpc.mockResolvedValue({ data: newBalance, error: null });
    db._insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: logId }, error: null }),
      }),
    });
    mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

    const result = await checkAndDeductCredits('user-1', 'photo_verify', 'gemini');

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.usageLogId).toBe(logId);
    expect(result.balance).toBe(newBalance);
    expect(result.cost).toBe(ACTION_COSTS.photo_verify);
    // RPC recibe el coste correcto (INV-2)
    expect(db._rpc).toHaveBeenCalledWith('deduct_credits', {
      p_user_id: 'user-1',
      p_amount: ACTION_COSTS.photo_verify,
    });
  });

  it('devuelve allowed:false cuando deduct_credits falla (saldo insuficiente)', async () => {
    const db = makeDb();
    db._rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_credits' } });
    mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

    const result = await checkAndDeductCredits('user-2', 'photo_verify', 'gemini');

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe('insufficient_credits');
    // No debe haber intento de insertar usage_log (§C-9.5)
    expect(db.from).not.toHaveBeenCalledWith('usage_log');
  });

  it('reembolsa y lanza AppError(internal) si el insert de usage_log falla (§C-9.6)', async () => {
    const db = makeDb();
    const refundRpc = vi.fn().mockResolvedValue({ error: null });
    db._rpc.mockImplementation(async (name: string) => {
      if (name === 'deduct_credits') return { data: 0.09, error: null };
      if (name === 'refund_credits') return refundRpc();
      return { data: null, error: null };
    });
    db._insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
      }),
    });
    mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

    await expect(checkAndDeductCredits('user-3', 'photo_verify', 'gemini')).rejects.toThrow(
      AppError,
    );
    // Reembolso inmediato (§C-9.6)
    expect(db._rpc).toHaveBeenCalledWith(
      'refund_credits',
      expect.objectContaining({ p_user_id: 'user-3' }),
    );
  });

  it('el coste cobrado coincide con ACTION_COSTS[action] para cada acción', async () => {
    const actions = ['photo_verify', 'chat_message', 'daily_briefing'] as const;
    for (const action of actions) {
      vi.clearAllMocks();
      const db = makeDb();
      db._rpc.mockResolvedValue({ data: 1.0, error: null });
      db._insert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'log-x' }, error: null }),
        }),
      });
      mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

      await checkAndDeductCredits('user-4', action, 'groq');

      expect(db._rpc).toHaveBeenCalledWith('deduct_credits', {
        p_user_id: 'user-4',
        p_amount: ACTION_COSTS[action],
      });
    }
  });
});

describe('refundCredits (§C-9.6, §C-14.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('llama a refund_credits con los parámetros correctos', async () => {
    const db = makeDb();
    db._rpc.mockResolvedValue({ error: null });
    mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

    await refundCredits('user-5', 0.006, 'log-xyz');

    expect(db._rpc).toHaveBeenCalledWith('refund_credits', {
      p_user_id: 'user-5',
      p_amount: 0.006,
      p_usage_log_id: 'log-xyz',
    });
  });

  it('lanza AppError(internal) si el RPC de reembolso falla', async () => {
    const db = makeDb();
    db._rpc.mockResolvedValue({ error: { message: 'rpc error' } });
    mockClient.mockReturnValue(db as unknown as ReturnType<typeof createServiceClient>);

    await expect(refundCredits('user-6', 0.006, 'log-fail')).rejects.toThrow(AppError);
  });
});
