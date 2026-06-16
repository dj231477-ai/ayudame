import 'server-only';
import { getValidAccessToken } from './tokens';

// Google Calendar (lectura) — Pro+. SPEC §C-1.2 #8 (ajuste de bloques a reuniones).
// Solo lectura de eventos próximos; el reagendado automático queda fuera (algoritmo no
// especificado en el SPEC: se difiere para no inventar comportamiento).
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

export async function listUpcomingEvents(userId: string): Promise<CalEvent[]> {
  const token = await getValidAccessToken(userId);
  if (!token) return [];
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
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
