import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@flowday/core/errors';

// SPEC §C-11.1: helpers de respuesta uniforme + requireUser.

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser } }),
}));

import { requireUser, ok, fail } from './respond';

beforeEach(() => getUser.mockReset());

describe('ok', () => {
  it('responde 200 con el cuerpo JSON', async () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });
  it('respeta el status de init (p. ej. 201)', () => {
    expect(ok({ x: 1 }, { status: 201 }).status).toBe(201);
  });
});

describe('fail (§C-11.1 forma uniforme de error)', () => {
  it('mapea un AppError a su httpStatus y código', async () => {
    const res = fail(new AppError('insufficient_credits'));
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe('insufficient_credits');
  });
  it('un error desconocido se mapea a 500 internal', async () => {
    const res = fail(new Error('boom'));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('internal');
  });
  it('localiza el mensaje en inglés cuando se pide', async () => {
    const res = fail(new AppError('unauthorized'), 'en');
    expect((await res.json()).error.message).toBe('You need to sign in.');
  });
});

describe('requireUser', () => {
  it('devuelve el contexto del usuario autenticado', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { locale: 'en' } } } });
    const ctx = await requireUser();
    expect(ctx.userId).toBe('u1');
    expect(ctx.locale).toBe('en');
  });
  it('por defecto locale es es', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u2', email: undefined, user_metadata: {} } } });
    expect((await requireUser()).locale).toBe('es');
  });
  it('lanza unauthorized si no hay sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireUser()).rejects.toThrow('unauthorized');
  });
});
