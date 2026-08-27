import { describe, it, expect } from 'vitest';
import { brand } from './brand';

// SPEC §C-5.2, INV-10: tokens de marca mínimos (breakpoint base 375px, tipos de bloque).
describe('brand tokens', () => {
  it('breakpoint base es 375px (INV-10 mobile-first)', () => {
    expect(brand.breakpoints.base).toBe(375);
  });

  it('expone los 5 tipos de bloque con label y color', () => {
    expect(Object.keys(brand.blockTypes)).toEqual(['deep', 'admin', 'body', 'rest', 'review']);
    for (const t of Object.values(brand.blockTypes)) {
      expect(t.label).toBeTruthy();
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('expone etiquetas para los 5 estados de bloque (§C-13.2)', () => {
    expect(Object.keys(brand.blockStatusLabels)).toEqual([
      'pending',
      'active',
      'awaiting_photo',
      'verified',
      'skipped',
    ]);
  });
});
