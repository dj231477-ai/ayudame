'use client';
import { getErrorMessage, type ErrorCode } from '@flowday/core/errors';

// Cliente fetch para componentes cliente. Mapea la forma uniforme de error (§C-11.1).
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: { code?: string; message?: string } })
    | null;

  if (!res.ok) {
    const code = (json?.error?.code ?? 'internal') as ErrorCode;
    const message = json?.error?.message ?? getErrorMessage(code);
    throw new ApiError(code, message);
  }
  return json as T;
}
