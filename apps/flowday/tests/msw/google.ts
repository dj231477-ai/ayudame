import { http, HttpResponse } from 'msw';

// Handlers de las APIs de Google que usa FlowDay (§C-11.5, §C-26.2).
// Las URLs deben coincidir con las de lib/google/*.ts.
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
export const CAL_API = 'https://www.googleapis.com/calendar/v3';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface TaskListFixture {
  id: string;
  title: string;
  tasks: Array<{ id: string; title: string; status?: string; due?: string }>;
}

/**
 * Google Tasks tal y como lo consume `listTasks()` desde D-14: una llamada a /users/@me/lists y
 * después una por lista. Declarar las listas de una vez evita encadenar respuestas por orden de
 * llamada, que es exactamente lo que hacía frágiles a los mocks de `fetch` hechos a mano.
 */
export function googleTaskLists(lists: TaskListFixture[]) {
  return [
    http.get(`${TASKS_API}/users/@me/lists`, () =>
      HttpResponse.json({ items: lists.map((l) => ({ id: l.id, title: l.title })) }),
    ),
    http.get(`${TASKS_API}/lists/:listId/tasks`, ({ params }) => {
      const list = lists.find((l) => l.id === params.listId);
      if (!list) return HttpResponse.json({ items: [] });
      return HttpResponse.json({
        items: list.tasks.map((t) => ({ status: 'needsAction', ...t })),
      });
    }),
  ];
}

/** Fallo de la llamada a /users/@me/lists (p. ej. la API deshabilitada — D-22). */
export function googleTaskListsFail(status = 403) {
  return http.get(`${TASKS_API}/users/@me/lists`, () =>
    HttpResponse.text('forbidden', { status }),
  );
}

/** PATCH sobre una tarea concreta: lo usan completeTask (D-13) y scheduleTask (D-24). */
export function googleTaskPatch(onPatch?: (body: unknown, listId: string, taskId: string) => void, ok = true) {
  return http.patch(`${TASKS_API}/lists/:listId/tasks/:taskId`, async ({ request, params }) => {
    onPatch?.(await request.json(), String(params.listId), String(params.taskId));
    return ok ? HttpResponse.json({ id: params.taskId }) : HttpResponse.text('err', { status: 400 });
  });
}

export interface CalEventFixture {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Lectura del calendario primario (§C-26.2). */
export function googleCalendarEvents(events: CalEventFixture[], onRequest?: (url: URL) => void) {
  return http.get(`${CAL_API}/calendars/primary/events`, ({ request }) => {
    onRequest?.(new URL(request.url));
    return HttpResponse.json({ items: events });
  });
}

export function googleCalendarEventsFail(status = 500) {
  return http.get(`${CAL_API}/calendars/primary/events`, () => HttpResponse.text('err', { status }));
}

/** Creación de evento real en Calendar (D-26, §C-26.7c). */
export function googleCalendarCreate(id: string | null = 'evt-1', onCreate?: (body: unknown) => void) {
  return http.post(`${CAL_API}/calendars/primary/events`, async ({ request }) => {
    onCreate?.(await request.json());
    if (id === null) return HttpResponse.text('forbidden', { status: 403 });
    return HttpResponse.json({ id });
  });
}

/** Reagenda de un evento ya creado (D-26). */
export function googleCalendarUpdate(ok = true, onUpdate?: (body: unknown, eventId: string) => void) {
  return http.patch(`${CAL_API}/calendars/primary/events/:eventId`, async ({ request, params }) => {
    onUpdate?.(await request.json(), String(params.eventId));
    return ok ? HttpResponse.json({}) : HttpResponse.text('not found', { status: 404 });
  });
}

/** Refresco de access token OAuth (§C-11.5). */
export function googleTokenRefresh(body: Record<string, unknown> = { access_token: 'nuevo', expires_in: 3600 }, status = 200) {
  return http.post(OAUTH_TOKEN_URL, () =>
    status === 200 ? HttpResponse.json(body) : HttpResponse.text('err', { status }),
  );
}
