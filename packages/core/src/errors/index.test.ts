import { describe, it, expect } from 'vitest';
import {
  AppError,
  ERROR_CATALOG,
  getErrorMessage,
  toAppError,
  toErrorResponse,
  type ErrorCode,
} from './index';

// SPEC §C-14.2 + §C-18.2: mapeo code -> {httpStatus, i18nKey} y code -> mensaje.
describe('error catalog (§C-14.2)', () => {
  const expectedStatus: Record<ErrorCode, number> = {
    insufficient_credits: 402,
    block_state_invalid: 409,
    photo_too_large: 400,
    unsupported_media: 400,
    ai_vision_exhausted: 503,
    rate_limited: 429,
    unauthorized: 401,
    forbidden_plan: 403,
    not_found: 404,
    bad_request: 400,
    internal: 500,
  };

  it('cada code mapea al httpStatus del SPEC', () => {
    for (const code of Object.keys(expectedStatus) as ErrorCode[]) {
      expect(ERROR_CATALOG[code].httpStatus).toBe(expectedStatus[code]);
    }
  });

  it('getErrorMessage devuelve ES por defecto y EN si se pide', () => {
    expect(getErrorMessage('insufficient_credits')).toMatch(/Créditos insuficientes/);
    expect(getErrorMessage('insufficient_credits', 'en')).toMatch(/Not enough credits/);
  });

  it('AppError lleva httpStatus del catálogo', () => {
    const err = new AppError('insufficient_credits');
    expect(err.httpStatus).toBe(402);
    expect(err.code).toBe('insufficient_credits');
  });

  it('toAppError mapea errores RPC conocidos (insufficient_credits)', () => {
    const mapped = toAppError(new Error('insufficient_credits'));
    expect(mapped.code).toBe('insufficient_credits');
  });

  it('toAppError mapea lo desconocido a internal (sin filtrar detalles)', () => {
    const mapped = toAppError(new Error('ECONNRESET at 10.0.0.1 secret=abc'));
    expect(mapped.code).toBe('internal');
  });

  it('toErrorResponse produce la forma uniforme (§C-11.1)', () => {
    const { status, body } = toErrorResponse(new AppError('rate_limited'), 'es');
    expect(status).toBe(429);
    expect(body.error.code).toBe('rate_limited');
    expect(typeof body.error.message).toBe('string');
  });
});
