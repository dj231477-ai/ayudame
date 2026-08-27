import { describe, it, expect } from 'vitest';
import { buildPlanPrompt, parsePlanResponse, hasRoomToday } from './plan-prompt';

// SPEC §C-26.1/§C-26.2/§C-26.2b, D-10/D-14.
describe('buildPlanPrompt (§C-26)', () => {
  it('lista los bloques fijos y pide JSON', () => {
    const p = buildPlanPrompt([{ label: 'Reunión', start_time: '10:00', end_time: '11:00' }], '08:00');
    expect(p).toContain('10:00-11:00: Reunión');
    expect(p).toContain('SOLO con JSON');
  });

  it('sin bloques fijos, lo dice explícito', () => {
    expect(buildPlanPrompt([], '08:00')).toContain('Ninguno.');
  });

  it('D-14: usa DAY_START (07:00) como piso si "ahora" es más temprano', () => {
    expect(buildPlanPrompt([], '06:00')).toContain('va de 07:00 a 21:00');
  });

  it('D-14: usa "ahora" como piso si ya pasó DAY_START — nunca asigna en el pasado', () => {
    const p = buildPlanPrompt([], '14:00');
    expect(p).toContain('va de 14:00 a 21:00');
    expect(p).toContain('NUNCA asignes nada antes de 14:00');
  });
});

describe('hasRoomToday (D-14, §C-26.2b)', () => {
  it('hay margen si "ahora" es antes del fin del día planificable', () => {
    expect(hasRoomToday('14:00')).toBe(true);
  });

  it('sin margen si ya se pasó el fin del día planificable (21:00)', () => {
    expect(hasRoomToday('21:00')).toBe(false);
    expect(hasRoomToday('23:30')).toBe(false);
  });
});

describe('parsePlanResponse', () => {
  it('parsea JSON limpio', () => {
    const r = parsePlanResponse(
      '{"blocks":[{"task_id":"t1","label":"Leer","start_time":"08:00","end_time":"08:30","type":"review"}]}',
    );
    expect(r).toEqual([
      { task_id: 't1', label: 'Leer', start_time: '08:00', end_time: '08:30', type: 'review' },
    ]);
  });

  it('tolera fences ```json', () => {
    const r = parsePlanResponse('```json\n{"blocks":[]}\n```');
    expect(r).toEqual([]);
  });

  it('descarta filas con campos inválidos sin lanzar', () => {
    const r = parsePlanResponse(
      '{"blocks":[{"task_id":"t1","label":"x","start_time":"8am","end_time":"08:30","type":"deep"},' +
        '{"task_id":"t2","label":"y","start_time":"09:00","end_time":"09:30","type":"not_a_type"}]}',
    );
    expect(r).toEqual([]);
  });

  it('respuesta no parseable ⇒ lista vacía (sin lanzar)', () => {
    expect(parsePlanResponse('lo siento, no puedo')).toEqual([]);
  });

  it('D-14: descarta bloques antes de earliestStart aunque el modelo no siguiera la instrucción', () => {
    const r = parsePlanResponse(
      '{"blocks":[{"task_id":"t1","label":"tarde","start_time":"10:00","end_time":"10:30","type":"admin"},' +
        '{"task_id":"t2","label":"a tiempo","start_time":"15:00","end_time":"15:30","type":"admin"}]}',
      '14:00',
    );
    expect(r).toEqual([
      { task_id: 't2', label: 'a tiempo', start_time: '15:00', end_time: '15:30', type: 'admin' },
    ]);
  });

  // §C-26.2: el prompt pide no superponerse, pero es una instrucción en lenguaje natural.
  // computePlan materializa esta salida en `blocks`, así que hay que comprobarlo mecánicamente.
  describe('validación de solapes con los bloques fijos', () => {
    const REUNION = [{ label: 'Reunión de equipo', start_time: '10:00', end_time: '11:00' }];
    const respuesta = (bloques: string) => `{"blocks":[${bloques}]}`;
    const bloque = (id: string, start: string, end: string) =>
      `{"task_id":"${id}","label":"${id}","start_time":"${start}","end_time":"${end}","type":"deep"}`;

    it('descarta el bloque que pisa una reunión de Calendar', () => {
      const r = parsePlanResponse(respuesta(bloque('t1', '10:30', '11:30')), undefined, REUNION);
      expect(r).toEqual([]);
    });

    it('conserva el que no la pisa y descarta el que sí', () => {
      const r = parsePlanResponse(
        respuesta([bloque('bueno', '08:00', '09:00'), bloque('malo', '10:30', '11:30')].join(',')),
        undefined,
        REUNION,
      );
      expect(r.map((b) => b.task_id)).toEqual(['bueno']);
    });

    it('descarta el segundo de dos bloques que se pisan entre sí', () => {
      const r = parsePlanResponse(
        respuesta([bloque('primero', '08:00', '09:00'), bloque('choca', '08:30', '09:30')].join(',')),
        undefined,
        [],
      );
      expect(r.map((b) => b.task_id)).toEqual(['primero']);
    });

    it('sin fixedBlocks no aplica la comprobación (compatibilidad con la firma previa)', () => {
      const r = parsePlanResponse(respuesta(bloque('t1', '10:30', '11:30')));
      expect(r).toHaveLength(1);
    });

    it('combina el filtro de solapes con el de earliestStart', () => {
      const r = parsePlanResponse(
        respuesta([bloque('pasado', '08:00', '09:00'), bloque('pisa', '10:30', '11:30'), bloque('ok', '14:00', '15:00')].join(',')),
        '12:00',
        REUNION,
      );
      expect(r.map((b) => b.task_id)).toEqual(['ok']);
    });
  });
});
