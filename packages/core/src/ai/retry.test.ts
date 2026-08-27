import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';
import { AppError } from '../errors';

// SPEC §C-10.4: reintentos con backoff. No reintenta AppError (errores de dominio).

describe('withRetry (§C-10.4)', () => {
  it('devuelve el resultado al primer intento si no falla', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    expect(await withRetry(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta fallos transitorios y acaba devolviendo el resultado', async () => {
    let n = 0;
    const fn = vi.fn(() => {
      n += 1;
      return n < 3 ? Promise.reject(new Error('net')) : Promise.resolve('ok');
    });
    expect(await withRetry(fn, { baseDelayMs: 1, retries: 3 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('NO reintenta un AppError (determinístico) y lo propaga de inmediato', async () => {
    const fn = vi.fn(() => Promise.reject(new AppError('insufficient_credits')));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('insufficient_credits');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('agota los reintentos y lanza el último error', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('always')));
    await expect(withRetry(fn, { baseDelayMs: 1, retries: 2 })).rejects.toThrow('always');
    expect(fn).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
  });
});
