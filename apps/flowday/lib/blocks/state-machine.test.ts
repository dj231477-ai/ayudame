import { describe, it, expect } from 'vitest';
import { canTransition } from './state-machine';

// SPEC §C-13.2: transiciones válidas exactas.
describe('canTransition (§C-13.2)', () => {
  it('permite las transiciones válidas del SPEC', () => {
    expect(canTransition('pending', 'active')).toBe(true);
    expect(canTransition('active', 'awaiting_photo')).toBe(true);
    expect(canTransition('awaiting_photo', 'verified')).toBe(true);
    expect(canTransition('active', 'skipped')).toBe(true);
    expect(canTransition('awaiting_photo', 'skipped')).toBe(true);
  });

  it('rechaza transiciones inválidas', () => {
    expect(canTransition('pending', 'verified')).toBe(false);
    expect(canTransition('pending', 'skipped')).toBe(false);
    expect(canTransition('verified', 'active')).toBe(false);
    expect(canTransition('skipped', 'active')).toBe(false);
    expect(canTransition('awaiting_photo', 'active')).toBe(false);
  });
});
