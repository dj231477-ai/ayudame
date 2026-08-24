import { describe, it, expect } from 'vitest';
import { computeCatchUp } from './catch-up';

// SPEC §C-13.3b, D-15.
describe('computeCatchUp', () => {
  it('null si la ventana original todavía no terminó', () => {
    expect(computeCatchUp(9 * 60, '10:00', '10:30')).toBeNull();
    expect(computeCatchUp(10 * 60 + 15, '10:00', '10:30')).toBeNull(); // dentro de la ventana
  });

  it('reagenda a "ahora" preservando la duración original si ya pasó', () => {
    // 10:00-10:30 (30 min), ahora son las 14:00 -> nuevo bloque 14:00-14:30.
    expect(computeCatchUp(14 * 60, '10:00', '10:30')).toEqual({
      start_time: '14:00',
      end_time: '14:30',
    });
  });

  it('respeta un piso mínimo de duración aunque el bloque original fuera muy corto', () => {
    // 10:00-10:05 (5 min) -> se reagenda con al menos 15 min.
    expect(computeCatchUp(14 * 60, '10:00', '10:05')).toEqual({
      start_time: '14:00',
      end_time: '14:15',
    });
  });

  it('el límite es exactamente cuando end_time == nowMin (ya "pasó")', () => {
    expect(computeCatchUp(10 * 60 + 30, '10:00', '10:30')).toEqual({
      start_time: '10:30',
      end_time: '11:00',
    });
  });
});
