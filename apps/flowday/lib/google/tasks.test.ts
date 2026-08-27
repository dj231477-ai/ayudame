import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// SPEC §C-11.5, D-13, D-14, D-24: cliente de Google Tasks.
// D-14: se leen TODAS las listas del usuario, no solo @default, y el id que sale de aquí es
// compuesto "{listId}:{taskId}" — Google exige la lista para leer o escribir una tarea.

const getValidAccessToken = vi.fn();
vi.mock('./tokens', () => ({ getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a) }));

import { listTasks, completeTask, scheduleTask } from './tasks';

const fetchMock = vi.fn();

beforeEach(() => {
  getValidAccessToken.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** Respuesta de fetch mínima: `ok` + `json`, y `text` para las ramas de error que loguean. */
function res(ok: boolean, body: unknown = {}, status = ok ? 200 : 500) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('err') };
}

/**
 * Encadena las respuestas de listTasks: primero /users/@me/lists, después una llamada por lista
 * en el mismo orden. El módulo hace esos fetch por lista con Promise.all, así que basta con
 * resolver por URL en vez de por orden de llamada.
 */
function mockLists(lists: Array<{ id: string; title: string }>, tasksByList: Record<string, unknown[]>) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/users/@me/lists')) return Promise.resolve(res(true, { items: lists }));
    const match = url.match(/\/lists\/([^/]+)\/tasks/);
    const listId = match ? decodeURIComponent(match[1] as string) : '';
    return Promise.resolve(res(true, { items: tasksByList[listId] ?? [] }));
  });
}

describe('listTasks (§C-11.5, D-14)', () => {
  it('devuelve [] si el usuario no tiene Google conectado, sin llamar a la API', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await listTasks('u1')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lee todas las listas y compone el id como {listId}:{taskId}', async () => {
    getValidAccessToken.mockResolvedValue('token');
    mockLists(
      [
        { id: 'l1', title: 'Mis tareas' },
        { id: 'l2', title: 'Trabajo' },
      ],
      {
        l1: [{ id: 't1', title: 'Informe', status: 'needsAction', due: '2026-06-22T00:00:00.000Z' }],
        l2: [{ id: 't2', title: 'Llamar', status: 'needsAction' }],
      },
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
    getValidAccessToken.mockResolvedValue('token');
    mockLists([{ id: 'l1', title: 'Mis tareas' }], { l1: [] });
    await listTasks('u1');
    // Ojo: la URL base ya contiene "/tasks/v1", hay que filtrar por la ruta /lists/<id>/tasks.
    const taskUrls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => /\/lists\/[^/]+\/tasks/.test(u));
    expect(taskUrls[0]).toContain('showCompleted=false');
  });

  it('devuelve [] si el usuario no tiene ninguna lista', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(true, { items: [] }));
    expect(await listTasks('u1')).toEqual([]);
  });

  it('devuelve [] si falla la llamada a las listas (degradación explícita, D-22)', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(false, {}, 403));
    expect(await listTasks('u1')).toEqual([]);
  });

  it('una lista que falla no tumba las demás', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/users/@me/lists')) {
        return Promise.resolve(res(true, { items: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }] }));
      }
      if (url.includes('/lists/l1/')) return Promise.resolve(res(false, {}, 500));
      return Promise.resolve(res(true, { items: [{ id: 't2', title: 'Sobrevive', status: 'needsAction' }] }));
    });

    const tasks = await listTasks('u1');
    expect(tasks).toEqual([{ id: 'l2:t2', title: 'Sobrevive', status: 'needsAction', due: undefined }]);
  });

  it('escapa el id de lista en la URL', async () => {
    getValidAccessToken.mockResolvedValue('token');
    mockLists([{ id: 'lista/rara', title: 'X' }], { 'lista/rara': [] });
    await listTasks('u1');
    const taskUrl = fetchMock.mock.calls.map((c) => c[0] as string).find((u) => /\/lists\/.+\/tasks/.test(u));
    expect(taskUrl).toContain(encodeURIComponent('lista/rara'));
  });
});

describe('completeTask (D-13)', () => {
  it('devuelve false sin token', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await completeTask('u1', 'l1:t1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCHea status=completed sobre la lista y la tarea del id compuesto', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(true));
    expect(await completeTask('u1', 'l1:t1')).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/lists/l1/tasks/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'completed' });
  });

  it('id sin lista (formato anterior a D-14) ⇒ false, sin llamar a Google', async () => {
    getValidAccessToken.mockResolvedValue('token');
    expect(await completeTask('u1', 't1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parte solo por el primer ":" (un taskId puede contenerlo)', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(true));
    await completeTask('u1', 'l1:t1:extra');
    expect(fetchMock.mock.calls[0]?.[0] as string).toContain(`/tasks/${encodeURIComponent('t1:extra')}`);
  });

  it('devuelve false si Google responde error', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(false, {}, 404));
    expect(await completeTask('u1', 'l1:t1')).toBe(false);
  });
});

describe('scheduleTask (D-24, §C-26.7)', () => {
  it('devuelve false sin token', async () => {
    getValidAccessToken.mockResolvedValue(null);
    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('escribe `due` como fecha a medianoche UTC (Google descarta la hora)', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(true));
    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/lists/l1/tasks/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ due: '2026-06-22T00:00:00.000Z' });
  });

  it('id sin lista ⇒ false, sin llamar a Google', async () => {
    getValidAccessToken.mockResolvedValue('token');
    expect(await scheduleTask('u1', 't1', '2026-06-22')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devuelve false si Google responde error', async () => {
    getValidAccessToken.mockResolvedValue('token');
    fetchMock.mockResolvedValue(res(false, {}, 400));
    expect(await scheduleTask('u1', 'l1:t1', '2026-06-22')).toBe(false);
  });
});
