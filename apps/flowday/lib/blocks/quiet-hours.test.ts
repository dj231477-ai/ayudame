import { describe, it, expect } from 'vitest';
import { isQuietHours } from './quiet-hours';

// SPEC §C-13.5c, D-12.
describe('isQuietHours', () => {
  it('deshabilitado si falta start o end', () => {
    expect(isQuietHours(60, null, '07:00')).toBe(false);
    expect(isQuietHours(60, '22:00', null)).toBe(false);
    expect(isQuietHours(60, null, null)).toBe(false);
  });

  it('rango dentro del mismo día (start < end)', () => {
    expect(isQuietHours(13 * 60, '12:00', '14:00')).toBe(true); // 13:00, dentro
    expect(isQuietHours(11 * 60, '12:00', '14:00')).toBe(false); // 11:00, antes
    expect(isQuietHours(14 * 60, '12:00', '14:00')).toBe(false); // 14:00, límite exclusivo
    expect(isQuietHours(12 * 60, '12:00', '14:00')).toBe(true); // 12:00, límite inclusivo
  });

  it('rango que cruza medianoche (start > end)', () => {
    // 22:00–07:00: silencio de noche.
    expect(isQuietHours(23 * 60, '22:00', '07:00')).toBe(true); // 23:00
    expect(isQuietHours(3 * 60, '22:00', '07:00')).toBe(true); // 03:00
    expect(isQuietHours(12 * 60, '22:00', '07:00')).toBe(false); // mediodía, fuera
    expect(isQuietHours(7 * 60, '22:00', '07:00')).toBe(false); // 07:00, límite exclusivo
    expect(isQuietHours(22 * 60, '22:00', '07:00')).toBe(true); // 22:00, límite inclusivo
  });

  it('rango vacío (start === end) se trata como deshabilitado', () => {
    expect(isQuietHours(0, '08:00', '08:00')).toBe(false);
  });
});
