import { describe, it, expect } from 'vitest';
import { freeGaps, fitsInSomeGap, dropOverlapping, timeToMin, minToTime, DAY_START_MIN, DAY_END_MIN } from './gaps';

// SPEC §C-26.2: huecos libres del día y validación de que lo propuesto por la IA cabe en ellos.

describe('timeToMin / minToTime', () => {
  it('convierte ida y vuelta', () => {
    expect(timeToMin('07:00')).toBe(DAY_START_MIN);
    expect(timeToMin('21:00')).toBe(DAY_END_MIN);
    expect(minToTime(timeToMin('13:45'))).toBe('13:45');
  });

  it('rellena con ceros a la izquierda', () => {
    expect(minToTime(9 * 60 + 5)).toBe('09:05');
  });
});

describe('freeGaps (§C-26.2)', () => {
  it('sin ocupados, el día entero es un solo hueco', () => {
    expect(freeGaps([])).toEqual([{ start: DAY_START_MIN, end: DAY_END_MIN }]);
  });

  it('un evento en medio parte el día en dos huecos', () => {
    const gaps = freeGaps([{ start: timeToMin('10:00'), end: timeToMin('11:00') }]);
    expect(gaps).toEqual([
      { start: DAY_START_MIN, end: timeToMin('10:00') },
      { start: timeToMin('11:00'), end: DAY_END_MIN },
    ]);
  });

  it('tolera ocupados desordenados', () => {
    const desordenados = freeGaps([
      { start: timeToMin('15:00'), end: timeToMin('16:00') },
      { start: timeToMin('09:00'), end: timeToMin('10:00') },
    ]);
    expect(desordenados.map((g) => minToTime(g.start))).toEqual(['07:00', '10:00', '16:00']);
  });

  it('fusiona ocupados que se solapan entre sí', () => {
    const gaps = freeGaps([
      { start: timeToMin('10:00'), end: timeToMin('12:00') },
      { start: timeToMin('11:00'), end: timeToMin('13:00') },
    ]);
    expect(gaps).toEqual([
      { start: DAY_START_MIN, end: timeToMin('10:00') },
      { start: timeToMin('13:00'), end: DAY_END_MIN },
    ]);
  });

  it('descarta los huecos más cortos que MIN_GAP_MIN', () => {
    // Deja solo 5 minutos entre las dos reuniones: no es un hueco útil.
    const gaps = freeGaps([
      { start: timeToMin('07:00'), end: timeToMin('10:00') },
      { start: timeToMin('10:05'), end: timeToMin('21:00') },
    ]);
    expect(gaps).toEqual([]);
  });

  it('recorta los ocupados que se salen de la jornada', () => {
    const gaps = freeGaps([{ start: timeToMin('05:00'), end: timeToMin('08:00') }]);
    expect(gaps).toEqual([{ start: timeToMin('08:00'), end: DAY_END_MIN }]);
  });

  it('un evento que cubre todo el día laboral no deja huecos', () => {
    expect(freeGaps([{ start: timeToMin('07:00'), end: timeToMin('21:00') }])).toEqual([]);
  });
});

describe('fitsInSomeGap', () => {
  const gaps = [{ start: timeToMin('09:00'), end: timeToMin('12:00') }];

  it('acepta un bloque contenido en el hueco', () => {
    expect(fitsInSomeGap({ start: timeToMin('10:00'), end: timeToMin('11:00') }, gaps)).toBe(true);
  });

  it('acepta un bloque que toca los bordes exactos', () => {
    expect(fitsInSomeGap({ start: timeToMin('09:00'), end: timeToMin('12:00') }, gaps)).toBe(true);
  });

  it('rechaza un bloque que se sale por el final', () => {
    expect(fitsInSomeGap({ start: timeToMin('11:00'), end: timeToMin('13:00') }, gaps)).toBe(false);
  });

  it('rechaza si no hay huecos', () => {
    expect(fitsInSomeGap({ start: timeToMin('10:00'), end: timeToMin('11:00') }, [])).toBe(false);
  });
});

describe('dropOverlapping', () => {
  const reunion = { start_time: '10:00', end_time: '11:00' };

  it('conserva un bloque que no pisa nada', () => {
    const bloques = [{ start_time: '08:00', end_time: '09:00' }];
    expect(dropOverlapping(bloques, [reunion])).toEqual(bloques);
  });

  it('descarta el bloque que pisa una reunión fija', () => {
    const bloques = [{ start_time: '10:30', end_time: '11:30' }];
    expect(dropOverlapping(bloques, [reunion])).toEqual([]);
  });

  it('descarta el bloque que contiene por completo a la reunión', () => {
    const bloques = [{ start_time: '09:00', end_time: '12:00' }];
    expect(dropOverlapping(bloques, [reunion])).toEqual([]);
  });

  it('ante dos bloques que se pisan entre sí, gana el que empieza antes', () => {
    const primero = { start_time: '08:00', end_time: '09:00' };
    const segundo = { start_time: '08:30', end_time: '09:30' };
    expect(dropOverlapping([segundo, primero], [])).toEqual([primero]);
  });

  it('acepta bloques consecutivos que solo se tocan en el borde', () => {
    const bloques = [
      { start_time: '08:00', end_time: '09:00' },
      { start_time: '09:00', end_time: '10:00' },
    ];
    expect(dropOverlapping(bloques, [])).toEqual(bloques);
  });

  it('descarta duración nula o invertida', () => {
    expect(dropOverlapping([{ start_time: '08:00', end_time: '08:00' }], [])).toEqual([]);
    expect(dropOverlapping([{ start_time: '09:00', end_time: '08:00' }], [])).toEqual([]);
  });

  it('descarta lo que cae fuera de la jornada', () => {
    expect(dropOverlapping([{ start_time: '05:00', end_time: '06:00' }], [])).toEqual([]);
    expect(dropOverlapping([{ start_time: '22:00', end_time: '23:00' }], [])).toEqual([]);
  });

  it('preserva el orden de entrada en la salida', () => {
    const bloques = [
      { start_time: '15:00', end_time: '16:00' },
      { start_time: '08:00', end_time: '09:00' },
    ];
    expect(dropOverlapping(bloques, [])).toEqual(bloques);
  });

  it('sin fijos deja pasar todo lo que sea coherente', () => {
    const bloques = [
      { start_time: '08:00', end_time: '09:00' },
      { start_time: '12:00', end_time: '13:00' },
    ];
    expect(dropOverlapping(bloques, [])).toEqual(bloques);
  });
});
