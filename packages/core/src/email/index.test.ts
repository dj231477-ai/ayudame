import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMailer } from './index';

// SPEC §C-9.7, D-3: Resend si hay RESEND_API_KEY; si no, no-op (dev/CI).

const ORIG = process.env.RESEND_API_KEY;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIG === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIG;
});

describe('getMailer (§C-9.7, D-3)', () => {
  it('sin RESEND_API_KEY degrada a no-op (no llama a la red, devuelve true)', async () => {
    delete process.env.RESEND_API_KEY;
    const ok = await getMailer().send('a@b.com', 'Hola', '<p>x</p>');
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con API key envía vía Resend y devuelve true en 2xx', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.EMAIL_FROM = 'FlowDay <ops@flowday.app>';
    fetchMock.mockResolvedValue({ ok: true });
    const ok = await getMailer().send('a@b.com', 'Hola', '<p>x</p>');
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer rk_test');
  });

  it('con API key pero respuesta de error devuelve false', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await getMailer().send('a@b.com', 'Hola', '<p>x</p>')).toBe(false);
  });
});
