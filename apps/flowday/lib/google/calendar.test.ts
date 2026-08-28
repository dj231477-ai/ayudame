import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import {
  googleCalendarEvents,
  googleCalendarEventsFail,
  googleCalendarCreate,
  googleCalendarUpdate,
  CAL_API,
} from '../../tests/msw/google';

// SPEC §C-1.2 #8, §C-26.2: lectura de eventos del calendario primario.
// §C-26.7c (D-26): escritura (createEvent/updateEvent) para `auto_organize_tasks`.
// La red va por MSW (§C-18.4): una petición no declarada rompe el test.

const getValidAccessToken = vi.fn();
vi.mock('./tokens', () => ({ getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a) }));

import { listUpcomingEvents, createEvent, updateEvent } from './calendar';

beforeEach(() => {
  getValidAccessToken.mockReset().mockResolvedValue('token');
});

const INPUT = {
  summary: 'Bloque profundo',
  startIso: '2026-06-22T10:00:00.000Z',
  endIso: '2026-06-22T11:00:00.000Z',
  timeZone: 'Europe/Madrid',
};

describe('listUpcomingEvents (§C-26.2)', () => {
  it('devuelve [] si el usuario no tiene Google conectado, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await listUpcomingEvents('u1')).toEqual([]);
  });

  it('mapea dateTime y date a start/end; los de día completo quedan sin hora', async () => {
    server.use(
      googleCalendarEvents([
        { id: 'e1', summary: 'Reunión', start: { dateTime: '2026-06-22T10:00:00Z' }, end: { dateTime: '2026-06-22T11:00:00Z' } },
        { id: 'e2', summary: 'Feriado', start: { date: '2026-06-22' }, end: { date: '2026-06-23' } },
      ]),
    );

    const events = await listUpcomingEvents('u1');
    expect(events[0]).toMatchObject({ id: 'e1', start: '2026-06-22T10:00:00Z', end: '2026-06-22T11:00:00Z' });
    // El de día completo cae a `date`: sin 'T', que es como daily-plan.ts lo distingue.
    expect(events[1]).toMatchObject({ id: 'e2', start: '2026-06-22', end: '2026-06-23' });
    expect(events[1]?.start?.includes('T')).toBe(false);
  });

  it('usa el rango recibido en timeMin/timeMax cuando se le pasa', async () => {
    let seen: URL | undefined;
    server.use(googleCalendarEvents([], (url) => (seen = url)));

    await listUpcomingEvents('u1', {
      timeMin: new Date('2026-06-22T00:00:00.000Z'),
      timeMax: new Date('2026-06-22T23:59:00.000Z'),
    });
    expect(seen?.searchParams.get('timeMin')).toBe('2026-06-22T00:00:00.000Z');
    expect(seen?.searchParams.get('timeMax')).toBe('2026-06-22T23:59:00.000Z');
  });

  it('sin título usa el marcador por defecto', async () => {
    server.use(googleCalendarEvents([{ id: 'e1', start: { dateTime: 'x' }, end: { dateTime: 'y' } }]));
    expect((await listUpcomingEvents('u1'))[0]?.summary).toBe('(sin título)');
  });

  it('devuelve [] si la API de Google responde error', async () => {
    server.use(googleCalendarEventsFail(500));
    expect(await listUpcomingEvents('u1')).toEqual([]);
  });
});

describe('createEvent (D-26, §C-26.7c)', () => {
  it('devuelve null sin token, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await createEvent('u1', INPUT)).toBeNull();
  });

  it('POSTea el evento con su timeZone y devuelve el id', async () => {
    let body: unknown;
    server.use(googleCalendarCreate('evt-1', (b) => (body = b)));

    expect(await createEvent('u1', INPUT)).toBe('evt-1');
    expect(body).toEqual({
      summary: INPUT.summary,
      start: { dateTime: INPUT.startIso, timeZone: INPUT.timeZone },
      end: { dateTime: INPUT.endIso, timeZone: INPUT.timeZone },
    });
  });

  it('devuelve null si Google responde error (best-effort, no propaga)', async () => {
    server.use(googleCalendarCreate(null));
    expect(await createEvent('u1', INPUT)).toBeNull();
  });

  it('devuelve null si la respuesta no trae id', async () => {
    // 200 pero cuerpo sin `id`: no se puede usar el helper, cuyo default es 'evt-1'.
    server.use(http.post(`${CAL_API}/calendars/primary/events`, () => HttpResponse.json({})));
    expect(await createEvent('u1', INPUT)).toBeNull();
  });
});

describe('updateEvent (D-26, §C-26.7c)', () => {
  it('devuelve false sin token, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await updateEvent('u1', 'evt-1', INPUT)).toBe(false);
  });

  it('PATCHea el evento por id y devuelve true', async () => {
    let eventId = '';
    server.use(googleCalendarUpdate(true, (_b, id) => (eventId = id)));

    expect(await updateEvent('u1', 'evt/1', INPUT)).toBe(true);
    // MSW devuelve el parámetro ya decodificado: que llegue 'evt/1' entero como UN segmento
    // prueba que el id se escapó (sin escapar, '/' habría partido la ruta).
    expect(eventId).toBe('evt/1');
  });

  it('devuelve false si Google responde error (best-effort, no propaga)', async () => {
    server.use(googleCalendarUpdate(false));
    expect(await updateEvent('u1', 'evt-1', INPUT)).toBe(false);
  });
});
