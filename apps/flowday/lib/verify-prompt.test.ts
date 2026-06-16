import { describe, it, expect } from 'vitest';
import { buildVerifyPrompt, parseVerifyResponse } from './verify-prompt';

// SPEC §C-13.4 / §C-18.2.
describe('buildVerifyPrompt (§C-13.4)', () => {
  it('interpola el tipo (enum seguro) y referencia <user_data>', () => {
    const p = buildVerifyPrompt('deep');
    expect(p).toContain('Tipo de bloque: deep');
    expect(p).toContain('<user_data>');
    expect(p).toContain('SOLO con JSON');
  });
});

describe('parseVerifyResponse', () => {
  it('parsea JSON limpio', () => {
    const r = parseVerifyResponse('{"verified":true,"confidence":0.9,"message":"ok"}');
    expect(r).toEqual({ verified: true, confidence: 0.9, message: 'ok' });
  });

  it('tolera fences ```json', () => {
    const r = parseVerifyResponse('```json\n{"verified":false,"confidence":0.2,"message":"no"}\n```');
    expect(r.verified).toBe(false);
    expect(r.confidence).toBe(0.2);
  });

  it('acota confidence a [0,1] y message a 80 chars', () => {
    const r = parseVerifyResponse(`{"verified":true,"confidence":5,"message":"${'x'.repeat(200)}"}`);
    expect(r.confidence).toBe(1);
    expect(r.message.length).toBe(80);
  });

  it('respuesta no parseable ⇒ no verificado (sin lanzar)', () => {
    expect(parseVerifyResponse('lo siento, no puedo')).toEqual({
      verified: false,
      confidence: 0,
      message: '',
    });
  });
});
