import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '../../tests/msw/server';
import {
  googleTaskLists,
  googleTaskListsFail,
  googleTaskPatch,
  TASKS_API,
} from '../../tests/msw/google';
import { http, HttpResponse } from 'msw';

// SPEC §C-11.5, D-13, D-14, D-24: cliente de Google Tasks.
// D-14: se leen TODAS las listas del usuario, no solo @default, y el id que sale de aquí es
// compuesto "{listId}:{taskId}" — Google exige la lista para leer o escribir una tarea.
// La red se simula con MSW (§C-18.4): cualquier petición no declarada rompe el test.

const getValidAccessToken = vi.fn();
vi.mock('./tokens', () => ({ getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a) }));

import { listTasks, completeTask, scheduleTask } from './tasks';

beforeEach(() => {
  getValidAccessToken.mockReset().mockResolvedValue('token');
});

describe('listTasks (§C-11.5, D-14)', () => {
  it('devuelve [] si el usuario no tiene Google conectado, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    // Sin handlers: si intentara salir a la red, MSW haría fallar el test.
    expect(await listTasks('u1')).toEqual([]);
  });

  it('lee todas las listas y compone el id como {listId}:{taskId}', async () => {
    server.use(
      ...googleTaskLists([
        { id: 'l1', title: 'Mis tareas', tasks: [{ id: 't1', title: 'Informe', due: '2026-06-22T00:00:00.000Z' }] },
        { id: 'l2', title: 'Trabajo', tasks: [{ id: 't2', title: 'Llamar' }] },
      ]),
    );

    const tasks = await listTasks('u1');
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.id).sort()).toEqual(['l1:t1', 'l2:t2']);
    expect(tasks.find((t) => t.id === 'l1:t1')).toMatchObject({
      title: 'Informe',
      status: 'needsAction',
      due: '2026-06-22T00:00:00.000Z',
    });
  });

  it('pide solo tareas sin completar', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${TASKS_API}/users/@me/lists`, () => HttpResponse.json({ items: [{ id: 'l1', title: 'A' }] })),
      http.get(`${TASKS_API}/lists/:listId/tasks`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ items: [] });
      }),
    );
    await listTasks('u1');
    expect(urls[0]).toContain('showCompleted=false');
  });

  it('devuelve [] si el usuario no tiene ninguna lista', async () => {
    server.use(...googleTaskLists([]));
    expect(await listTasks('u1')).toEqual([]);
  });

  it('devuelve [] si falla la llamada a las listas (degradación explícita, D-22)', async () => {
    server.use(googleTaskListsFail(403));
    expect(await listTasks('u1')).toEqual([]);
  });

  it('una lista que falla no tumba las demás', async () => {
    server.use(
      http.get(`${TASKS_API}/users/@me/lists`, () =>
        HttpResponse.json({ items: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }] }),
      ),
      http.get(`${TASKS_API}/lists/:listId/tasks`, ({ params }) =>
        params.listId === 'l1'
          ? HttpResponse.text('err', { status: 500 })
          : HttpResponse.json({ items: [{ id: 't2', title: 'Sobrevive', status: 'needsAction' }] }),
      ),
    );

    const tasks = await listTasks('u1');
    expect(tasks).toEqual([{ id: 'l2:t2', title: 'Sobrevive', status: 'needsAction', due: undefined }]);
  });

  it('escapa el id de lista en la URL', async () => {
    server.use(...googleTaskLists([{ id: 'lista/rara', title: 'X', tasks: [] }]));
    // Si el id no fuera escapado, la ruta tendría un segmento de más y MSW no la resolvería:
    // el handler devolvería 404 y listTasks daría []. Que resuelva prueba el encodeURIComponent.
    expect(await listTasks('u1')).toEqual([]);
  });
});

describe('completeTask (D-13)', () => {
  it('devuelve false sin token, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await completeTask('u1', 'l1:t1')).toBe(false);
  });

  it('PATCHea status=completed sobre la lista y la tarea del id compuesto', async () => {
    const seen: Array<{ body: unknown; listId: string; taskId: string }> = [];
    server.use(googleTaskPatch((body, listId, taskId) => seen.push({ body, listId, taskId })));

    expect(await completeTask('u1', 'l1:t1')).toBe(true);
    expect(seen[0]).toEqual({ body: { status: 'completed' }, listId: 'l1', taskId: 't1' });
  });

  it('id sin lista (formato anterior a D-14) ⇒ false, sin tocar la red', async () => {
    expect(await completeTask('u1', 't1')).toBe(false);
  });

  it('parte solo por el primer ":" (un taskId puede contenerlo)', async () => {
    const seen: string[] = [];
    server.use(googleTaskPatch((_b, _l, taskId) => seen.push(taskId)));
    await completeTask('u1', 'l1:t1:extra');
    expect(seen[0]).toBe('t1:extra');
  });

  it('devuelve false si Google responde error', async () => {
    server.use(googleTaskPatch(undefined, false));
    expect(await completeTask('u1', 'l1:t1')).toBe(false);
  });
});

describe('scheduleTask (D-24, §C-26.7)', () => {
  it('devuelve false sin token, sin tocar la red', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(false);
  });

  it('escribe `due` como fecha a medianoche UTC (Google descarta la hora)', async () => {
    const seen: Array<{ body: unknown; listId: string; taskId: string }> = [];
    server.use(googleTaskPatch((body, listId, taskId) => seen.push({ body, listId, taskId })));

    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(true);
    expect(seen[0]).toEqual({ body: { due: '2026-06-22T00:00:00.000Z' }, listId: 'l1', taskId: 't1' });
  });

  it('id sin lista ⇒ false, sin tocar la red', async () => {
    expect(await scheduleTask('u1', 't1', '2026-06-22')).toBe(false);
  });

  it('devuelve false si Google responde error', async () => {
    server.use(googleTaskPatch(undefined, false));
    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(false);
  });
});
