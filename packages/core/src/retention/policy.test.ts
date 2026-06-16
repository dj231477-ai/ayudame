import { describe, it, expect } from 'vitest';
import { RETENTION_DAYS, retentionCutoff } from './policy';

// SPEC §C-15.2.
describe('retention policy (§C-15.2)', () => {
  it('días por plan', () => {
    expect(RETENTION_DAYS.free.evidence_photos).toBe(7);
    expect(RETENTION_DAYS.pro.usage_log).toBe(365);
    expect(RETENTION_DAYS.team.evidence_photos).toBe(730);
  });

  it('retentionCutoff resta los días del plan', () => {
    const now = new Date('2026-06-13T00:00:00Z');
    const cutoff = retentionCutoff('free', 'evidence_photos', now);
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-06-06');
  });
});
