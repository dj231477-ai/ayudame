import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// SPEC §C-1.2 #8, §C-26.2: lectura de eventos del calendario primario.
// §C-26.7c (D-26): escritura (createEvent/updateEvent) para `auto_organize_tasks`.

const getValidAccessToken = vi.fn();
vi.mock('./tokens', () => ({ getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a) }));

import { listUpcomingEvents, createEvent, updateEvent } from './calendar';

const fetchMock = vi.fn();

beforeEach(() => {
  getValidAccessToken.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const INPUT = {
  summary: 'Bloque profundo',
  startIso: '2026-06-22T10:00:00.000Z',
  endIso: '2026-06-22T11:00:00.000Z',
  timeZone: 'Europe/Madrid',
};

describe('listUpcomingEvents (§C-26.2)', () => {
  it('devuelve [] si el usuario no tiene Google conectado', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await listUpcomingEvents('u1')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mapea dateTime y date a start/end; los de día completo quedan sin hora', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: 'e1', summary: 'Reunión', start: { dateTime: '2026-06-22T10:00:00Z' }, end: { dateTime: '2026-06-22T11:00:00Z' } },
            { id: 'e2', summary: 'Feriado', start: { date: '2026-06-22' }, end: { date: '2026-06-23' } },
          ],
        }),
    });
    const events = await listUpcomingEvents('u1');
    // El evento con hora conserva el instante completo (lleva 'T').
    expect(events[0]).toMatchObject({ id: 'e1', start: '2026-06-22T10:00:00Z', end: '2026-06-22T11:00:00Z' });
    // El de día completo cae a `date`: sin 'T', que es como daily-plan.ts lo distingue.
    expect(events[1]).toMatchObject({ id: 'e2', start: '2026-06-22', end: '2026-06-23' });
    expect(events[1]?.start?.includes('T')).toBe(false);
  });

  it('usa el rango recibido en timeMin/timeMax cuando se le pasa', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
    await listUpcomingEvents('u1', {
      timeMin: new Date('2026-06-22T00:00:00.000Z'),
      timeMax: new Date('2026-06-22T23:59:00.000Z'),
    });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain(encodeURIComponent('2026-06-22T00:00:00.000Z'));
    expect(url).toContain(encodeURIComponent('2026-06-22T23:59:00.000Z'));
  });

  it('sin título usa el marcador por defecto', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [{ id: 'e1', start: { dateTime: 'x' }, end: { dateTime: 'y' } }] }),
    });
    expect((await listUpcomingEvents('u1'))[0]?.summary).toBe('(sin título)');
  });

  it('devuelve [] si la API de Google responde error', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await listUpcomingEvents('u1')).toEqual([]);
  });
});

describe('createEvent (D-26, §C-26.7c)', () => {
  it('devuelve null sin token, sin llamar a Google', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await createEvent('u1', INPUT)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTea el evento con su timeZone y devuelve el id', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'evt-1' }) });
    expect(await createEvent('u1', INPUT)).toBe('evt-1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      summary: INPUT.summary,
      start: { dateTime: INPUT.startIso, timeZone: INPUT.timeZone },
      end: { dateTime: INPUT.endIso, timeZone: INPUT.timeZone },
    });
  });

  it('devuelve null si Google responde error (best-effort, no propaga)', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('forbidden') });
    expect(await createEvent('u1', INPUT)).toBeNull();
  });

  it('devuelve null si la respuesta no trae id', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    expect(await createEvent('u1', INPUT)).toBeNull();
  });
});

describe('updateEvent (D-26, §C-26.7c)', () => {
  it('devuelve false sin token, sin llamar a Google', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await updateEvent('u1', 'evt-1', INPUT)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCHea el evento por id y devuelve true', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: true });
    expect(await updateEvent('u1', 'evt/1', INPUT)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    // El id va escapado: un '/' sin escapar rompería la ruta.
    expect(url).toContain(encodeURIComponent('evt/1'));
  });

  it('devuelve false si Google responde error (best-effort, no propaga)', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('not found') });
    expect(await updateEvent('u1', 'evt-1', INPUT)).toBe(false);
  });
});
