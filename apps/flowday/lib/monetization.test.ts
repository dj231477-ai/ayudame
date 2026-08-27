import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-9.7: triggers de monetización por umbrales de métricas de plataforma.

let mockClient: MockClient;
const getFlag = vi.fn();
const setFlag = vi.fn((..._a: unknown[]) => Promise.resolve());
const mailerSend = vi.fn(() => Promise.resolve(true));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));
vi.mock('@flowday/core/flags', () => ({
  getFlag: (key: string) => getFlag(key),
  setFlag: (key: string, value: unknown) => setFlag(key, value),
}));
vi.mock('@flowday/core/email', () => ({ getMailer: () => ({ send: mailerSend }) }));

import { runMonetizationTriggers } from './monetization';

function withMetrics(metrics: Record<string, number>) {
  mockClient = createMockClient({ rpcResults: { get_platform_metrics: { data: metrics } } });
}

beforeEach(() => {
  getFlag.mockReset().mockResolvedValue(null);
  setFlag.mockClear();
  mailerSend.mockClear();
});

describe('runMonetizationTriggers (§C-9.7)', () => {
  it('activa pro_tier_active al superar 100 usuarios', async () => {
    withMetrics({ total_users: 120, monthly_active_users: 10, monthly_cost_usd: 0 });
    const { applied } = await runMonetizationTriggers();
    expect(applied).toContain('pro_tier_active');
    expect(setFlag).toHaveBeenCalledWith('pro_tier_active', true);
  });

  it('no reactiva un flag ya activo (idempotente)', async () => {
    getFlag.mockImplementation((k: string) => Promise.resolve(k === 'pro_tier_active' ? true : null));
    withMetrics({ total_users: 200, monthly_active_users: 10, monthly_cost_usd: 0 });
    const { applied } = await runMonetizationTriggers();
    expect(applied).not.toContain('pro_tier_active');
  });

  it('activa team_tier_active al superar 500 MAU', async () => {
    withMetrics({ total_users: 10, monthly_active_users: 600, monthly_cost_usd: 0 });
    const { applied } = await runMonetizationTriggers();
    expect(applied).toContain('team_tier_active');
  });

  it('envía email de upgrade y registra evento si el coste mensual supera $20', async () => {
    withMetrics({ total_users: 10, monthly_active_users: 10, monthly_cost_usd: 25 });
    const { applied } = await runMonetizationTriggers();
    expect(applied).toContain('upgrade_email');
    expect(mailerSend).toHaveBeenCalledTimes(1);
    expect(mockClient.log.find((l) => l.table === 'monetization_events')).toBeDefined();
  });

  it('sin umbrales superados: no aplica nada', async () => {
    withMetrics({ total_users: 1, monthly_active_users: 1, monthly_cost_usd: 1 });
    const { applied } = await runMonetizationTriggers();
    expect(applied).toEqual([]);
    expect(setFlag).not.toHaveBeenCalled();
    expect(mailerSend).not.toHaveBeenCalled();
  });
});
