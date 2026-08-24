import { describe, it, expect } from 'vitest';
import { buildPlanPrompt, parsePlanResponse } from './plan-prompt';

// SPEC §C-26.1/§C-26.2, D-10.
describe('buildPlanPrompt (§C-26)', () => {
  it('lista los bloques fijos y pide JSON', () => {
    const p = buildPlanPrompt([{ label: 'Reunión', start_time: '10:00', end_time: '11:00' }]);
    expect(p).toContain('10:00-11:00: Reunión');
    expect(p).toContain('SOLO con JSON');
  });

  it('sin bloques fijos, lo dice explícito', () => {
    expect(buildPlanPrompt([])).toContain('Ninguno.');
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
});
