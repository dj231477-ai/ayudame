import { describe, it, expect } from 'vitest';
import { timeToMinutes, localDate } from './datetime';

// SPEC §C-12.5, INV-12.
describe('datetime', () => {
  it('timeToMinutes parsea HH:MM y HH:MM:SS', () => {
    expect(timeToMinutes('06:30')).toBe(390);
    expect(timeToMinutes('09:00:00')).toBe(540);
  });

  it('localDate respeta la tz del usuario (INV-12)', () => {
    // 02:00 UTC del 13 = 21:00 del 12 en America/Bogota (UTC-5).
    expect(localDate(new Date('2026-06-13T02:00:00Z'), 'America/Bogota')).toBe('2026-06-12');
  });
});
