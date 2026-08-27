import { describe, it, expect } from 'vitest';
import { createMockClient } from '../tests/helpers/supabase-mock';
import { computeAnalytics } from './analytics';

// SPEC §C-1.2 #11: analytics personal calculado de datos existentes (sin medición inventada).

describe('computeAnalytics (§C-1.2 #11)', () => {
  it('calcula tasa de verificación, minutos verificados, gasto y desgloses', async () => {
    const supabase = createMockClient({
      tableResults: {
        blocks: {
          data: [
            { status: 'verified', type: 'deep', start_time: '06:00', end_time: '08:00' }, // 120 min
            { status: 'verified', type: 'admin', start_time: '09:00', end_time: '09:30' }, // 30 min
            { status: 'skipped', type: 'deep', start_time: '10:00', end_time: '11:00' },
            { status: 'pending', type: 'rest', start_time: '12:00', end_time: '12:30' },
          ],
        },
        evidence: {
          data: [
            { verified: true, created_at: '2026-06-13T14:00:00Z' },
            { verified: false, created_at: '2026-06-13T15:00:00Z' },
          ],
        },
        usage_log: {
          data: [
            { cost_charged: 0.006, refunded: false, created_at: '2026-06-13T14:00:00Z' },
            { cost_charged: 0.006, refunded: true, created_at: '2026-06-13T15:00:00Z' }, // reembolsado: no cuenta
          ],
        },
      },
    });

    const a = await computeAnalytics(supabase as never, 'u1');
    expect(a.blocksTotal).toBe(4);
    expect(a.verified).toBe(2);
    expect(a.skipped).toBe(1);
    expect(a.verificationRate).toBeCloseTo(2 / 3); // verified / (verified+skipped)
    expect(a.plannedVerifiedMinutes).toBe(150);
    expect(a.creditsSpentUsd).toBeCloseTo(0.006); // solo el no reembolsado
    expect(a.byType).toEqual({ deep: 2, admin: 1, rest: 1 });
    expect(a.byHour[14]).toBe(1); // 1 evidencia verificada a las 14h UTC
  });

  it('sin datos: tasa 0 y agregados vacíos sin dividir por cero', async () => {
    const supabase = createMockClient({
      tableResults: { blocks: { data: [] }, evidence: { data: [] }, usage_log: { data: [] } },
    });
    const a = await computeAnalytics(supabase as never, 'u1');
    expect(a.blocksTotal).toBe(0);
    expect(a.verificationRate).toBe(0);
    expect(a.creditsSpentUsd).toBe(0);
  });
});
