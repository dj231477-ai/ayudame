import { describe, it, expect } from 'vitest';
import {
  MARGIN,
  ACTION_COSTS,
  ACTION_COSTS_REAL,
  STIPENDS,
  CREDIT_PACKAGES,
  usdToCredits,
} from './pricing';

// SPEC §C-9.4 + INV-3: pricing.ts es la única fuente; el coste real se DERIVA del cobrado.
describe('pricing (INV-3, §C-9.4)', () => {
  it('coste real = cobrado / (1 + MARGIN), 6 decimales', () => {
    for (const key of Object.keys(ACTION_COSTS) as Array<keyof typeof ACTION_COSTS>) {
      const expected = +(ACTION_COSTS[key] / (1 + MARGIN)).toFixed(6);
      expect(ACTION_COSTS_REAL[key]).toBe(expected);
    }
  });

  it('con MARGIN=100%, photo_verify cobra 0.006 y cuesta 0.003', () => {
    expect(ACTION_COSTS.photo_verify).toBe(0.006);
    expect(ACTION_COSTS_REAL.photo_verify).toBe(0.003);
  });

  it('stipend Free = $0.30 (§C-9.2)', () => {
    expect(STIPENDS.free).toBe(0.3);
  });

  it('paquete starter: $3 -> $1.50 de saldo (§C-9.3)', () => {
    expect(CREDIT_PACKAGES.starter.price_usd).toBe(3);
    expect(CREDIT_PACKAGES.starter.credits_usd).toBe(1.5);
  });

  it('usdToCredits: $0.30 = 30 créditos (1 crédito = $0.01)', () => {
    expect(usdToCredits(0.3)).toBe(30);
  });
});
