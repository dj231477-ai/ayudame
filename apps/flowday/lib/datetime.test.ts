import { describe, it, expect } from 'vitest';
import { timeToMinutes, localDate, localTimeHHMM, localDayRangeUtc } from './datetime';

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

  it('localTimeHHMM formatea la hora local en HH:MM (§C-26)', () => {
    expect(localTimeHHMM(new Date('2026-06-13T14:05:00Z'), 'America/Bogota')).toBe('09:05');
    expect(localTimeHHMM(new Date('2026-06-13T00:00:00Z'), 'UTC')).toBe('00:00');
  });

  it('localDayRangeUtc devuelve el rango [00:00, 24:00) local en UTC (§C-26.2, D-10)', () => {
    const { start, end } = localDayRangeUtc('2026-06-13', 'America/Bogota');
    // Medianoche en Bogotá (UTC-5) es 05:00 UTC.
    expect(start.toISOString()).toBe('2026-06-13T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-14T05:00:00.000Z');
    // Un instante justo antes del rango cae en localDate del día anterior.
    expect(localDate(new Date(start.getTime() - 1), 'America/Bogota')).toBe('2026-06-12');
    // Un instante justo dentro cae en el día pedido.
    expect(localDate(start, 'America/Bogota')).toBe('2026-06-13');
  });
});
