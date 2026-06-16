// =============================================================================
// Reintentos con backoff exponencial  [SPEC §C-10.4 withRetry]
// Reintenta fallos transitorios (red / 5xx). No reintenta errores de dominio (AppError).
// =============================================================================

import { AppError } from '../errors';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 4000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Los errores de dominio (AppError) no se reintentan: son determinísticos.
      if (err instanceof AppError) throw err;
      lastErr = err;
      if (attempt === retries) break;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('retry_exhausted');
}
