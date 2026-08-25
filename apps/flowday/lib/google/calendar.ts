import 'server-only';
import { logger } from '@flowday/core/observability/logger';
import { getValidAccessToken } from './tokens';

// Google Calendar — Pro+. SPEC §C-1.2 #8 (ajuste de bloques a reuniones).
// Lectura de eventos (listUpcomingEvents) para la auto-organización (eventos con hora -> bloques
// sin IA, tareas sin hora -> encaje con IA, cache por hash, 1x/día vía morning-briefing o bajo
// demanda por WhatsApp) está en §C-26/§C-13.10 (D-10), implementada en lib/planning/daily-plan.ts.
// Escritura (createEvent/updateEvent, D-26/§C-26.7c): solo se usa cuando el usuario activa
// `profiles.auto_organize_tasks` — crea/actualiza el evento real de Calendar que corresponde a
// un bloque encajado a partir de una tarea de Google Tasks.
const CAL_API = 'https://www.googleapis.com/calendar/v3';

export interface CalEvent {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
}

interface RawEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function listUpcomingEvents(
  userId: string,
  range?: { timeMin: Date; timeMax: Date },
): Promise<CalEvent[]> {
  const token = await getValidAccessToken(userId);
  if (!token) return [];
  const timeMin = (range?.timeMin ?? new Date()).toISOString();
  const timeMax = (range?.timeMax ?? new Date(Date.now() + 24 * 3600 * 1000)).toISOString();
  const url =
    `${CAL_API}/calendars/primary/events?singleEvents=true&orderBy=startTime` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: RawEvent[] };
  return (json.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(sin título)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
  }));
}

export interface CalEventInput {
  summary: string;
  startIso: string; // instante UTC exacto, ej. localDateTimeToUtc(...).toISOString()
  endIso: string;
  timeZone: string;
}

/** D-26, §C-26.7c: crea el evento en el calendario primario. Devuelve su id, o null si falla. */
export async function createEvent(userId: string, input: CalEventInput): Promise<string | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;

  const res = await fetch(`${CAL_API}/calendars/primary/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.startIso, timeZone: input.timeZone },
      end: { dateTime: input.endIso, timeZone: input.timeZone },
    }),
  });
  if (!res.ok) {
    logger.warn({ event: 'google_calendar.create_event_failed', http_status: res.status, body: (await res.text()).slice(0, 300) });
    return null;
  }
  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}

/** D-26, §C-26.7c: reagenda un evento ya creado (ej. tras un catch-up). Best-effort. */
export async function updateEvent(userId: string, eventId: string, input: CalEventInput): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;

  const res = await fetch(`${CAL_API}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.startIso, timeZone: input.timeZone },
      end: { dateTime: input.endIso, timeZone: input.timeZone },
    }),
  });
  if (!res.ok) {
    logger.warn({ event: 'google_calendar.update_event_failed', http_status: res.status, body: (await res.text()).slice(0, 300) });
  }
  return res.ok;
}
