import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test-utils/msw/server';
import { getMailer } from './index';

// SPEC §C-9.7, D-3: Resend si hay RESEND_API_KEY; si no, no-op (dev/CI).
// Red simulada con MSW (§C-18.4): sin handler declarado, cualquier salida a la red rompe el test.

const RESEND_URL = 'https://api.resend.com/emails';
const ORIG = process.env.RESEND_API_KEY;

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIG;
});

describe('getMailer (§C-9.7, D-3)', () => {
  it('sin RESEND_API_KEY degrada a no-op (no llama a la red, devuelve true)', async () => {
    // Sin handler: si intentara enviar de verdad, MSW haría fallar el test.
    expect(await getMailer().send('a@b.com', 'Hola', '<p>x</p>')).toBe(true);
  });

  it('con API key envía vía Resend y devuelve true en 2xx', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.EMAIL_FROM = 'FlowDay <ops@flowday.app>';

    let auth: string | null = null;
    let body: Record<string, unknown> = {};
    server.use(
      http.post(RESEND_URL, async ({ request }) => {
        auth = request.headers.get('authorization');
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'email-1' });
      }),
    );

    expect(await getMailer().send('a@b.com', 'Hola', '<p>x</p>')).toBe(true);
    expect(auth).toBe('Bearer rk_test');
    expect(body).toMatchObject({ to: 'a@b.com', subject: 'Hola' });
  });

  it('con API key pero respuesta de error devuelve false', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    server.use(http.post(RESEND_URL, () => HttpResponse.text('boom', { status: 500 })));
    expect(await getMailer().send('a@b.com', 'Hola', '<p>x</p>')).toBe(false);
  });
});
