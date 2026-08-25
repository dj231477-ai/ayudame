import 'server-only';
import { logger } from '@flowday/core/observability/logger';
import { getValidAccessToken } from './tokens';

// Cliente Google Tasks (§C-11.5). Solo IDs/títulos; no se almacena contenido (C-1.3).
// D-14: lee TODAS las listas del usuario (no solo "Mis tareas"/@default) — un usuario puede
// tener sus tareas repartidas en varias listas con cualquier nombre.
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export interface GoogleTask {
  id: string; // compuesto "{listId}:{taskId}" — Google Tasks exige la lista para leer/completar
  title: string;
  status: string;
  due?: string;
}

interface RawTaskList {
  id: string;
  title: string;
}

interface RawTask {
  id: string;
  title: string;
  status: string;
  due?: string;
}

async function listTaskLists(token: string): Promise<RawTaskList[]> {
  const res = await fetch(`${TASKS_API}/users/@me/lists?maxResults=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    logger.warn({ event: 'google_tasks.list_lists_failed', http_status: res.status, body: (await res.text()).slice(0, 300) });
    return [];
  }
  const json = (await res.json()) as { items?: RawTaskList[] };
  return json.items ?? [];
}

export async function listTasks(userId: string): Promise<GoogleTask[]> {
  const token = await getValidAccessToken(userId);
  if (!token) return [];

  const lists = await listTaskLists(token);
  logger.info({ event: 'google_tasks.lists_found', count: lists.length, ids: lists.map((l) => l.id).join(',') });
  if (lists.length === 0) return [];

  const perList = await Promise.all(
    lists.map(async (list): Promise<GoogleTask[]> => {
      const res = await fetch(
        `${TASKS_API}/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=false&maxResults=100`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        logger.warn({ event: 'google_tasks.list_tasks_failed', http_status: res.status, body: (await res.text()).slice(0, 300) });
        return [];
      }
      const json = (await res.json()) as { items?: RawTask[] };
      return (json.items ?? []).map((t) => ({
        id: `${list.id}:${t.id}`,
        title: t.title,
        status: t.status,
        due: t.due,
      }));
    }),
  );

  const flat = perList.flat();
  logger.info({ event: 'google_tasks.tasks_found', count: flat.length });
  return flat;
}

function splitCompositeId(compositeId: string): { listId: string; taskId: string } | null {
  const sep = compositeId.indexOf(':');
  if (sep < 0) return null; // formato inesperado (id sin lista, de antes de D-14)
  return { listId: compositeId.slice(0, sep), taskId: compositeId.slice(sep + 1) };
}

export async function completeTask(userId: string, compositeId: string): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;
  const ids = splitCompositeId(compositeId);
  if (!ids) return false;

  const res = await fetch(
    `${TASKS_API}/lists/${encodeURIComponent(ids.listId)}/tasks/${encodeURIComponent(ids.taskId)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    },
  );
  return res.ok;
}

/**
 * D-24, §C-26.7: escribe la fecha (SOLO fecha, la API de Google Tasks descarta la hora tanto
 * al leer como al escribir `due` — confirmado contra la doc oficial y contra la cuenta real,
 * todo `due` vuelve como medianoche UTC) de una tarea que el planificador acaba de encajar hoy.
 */
export async function scheduleTask(userId: string, compositeId: string, dateStr: string): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;
  const ids = splitCompositeId(compositeId);
  if (!ids) return false;

  const res = await fetch(
    `${TASKS_API}/lists/${encodeURIComponent(ids.listId)}/tasks/${encodeURIComponent(ids.taskId)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ due: `${dateStr}T00:00:00.000Z` }),
    },
  );
  return res.ok;
}
