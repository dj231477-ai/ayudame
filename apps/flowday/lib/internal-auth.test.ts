import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { authorizeInternal } from './internal-auth';

// SPEC §C-11.7, M-5, INV-4: autorización de /internal/* en tiempo constante.

const ORIG = process.env.INTERNAL_ADMIN_SECRET;

function req(headers: Record<string, string> = {}) {
  return new Request('https://app.test/internal/x', { headers });
}

beforeEach(() => {
  process.env.INTERNAL_ADMIN_SECRET = 'the-secret';
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.INTERNAL_ADMIN_SECRET;
  else process.env.INTERNAL_ADMIN_SECRET = ORIG;
});

describe('authorizeInternal (§C-11.7)', () => {
  it('true con el secreto correcto', () => {
    expect(authorizeInternal(req({ 'x-internal-secret': 'the-secret' }))).toBe(true);
  });
  it('false con secreto incorrecto', () => {
    expect(authorizeInternal(req({ 'x-internal-secret': 'wrong' }))).toBe(false);
  });
  it('false sin cabecera', () => {
    expect(authorizeInternal(req())).toBe(false);
  });
  it('false si el servidor no tiene INTERNAL_ADMIN_SECRET configurado', () => {
    delete process.env.INTERNAL_ADMIN_SECRET;
    expect(authorizeInternal(req({ 'x-internal-secret': 'the-secret' }))).toBe(false);
  });
});
