import 'server-only';
import { getValidAccessToken } from './tokens';

// Cliente Google Tasks (§C-11.5). Solo IDs/títulos; no se almacena contenido (C-1.3).
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

export interface GoogleTask {
  id: string;
  title: string;
  status: string;
  due?: string;
}

export async function listTasks(userId: string): Promise<GoogleTask[]> {
  const token = await getValidAccessToken(userId);
  if (!token) return [];
  const res = await fetch(
    `${TASKS_API}/lists/@default/tasks?showCompleted=false&maxResults=50`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: GoogleTask[] };
  return json.items ?? [];
}

export async function completeTask(userId: string, taskId: string): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;
  const res = await fetch(`${TASKS_API}/lists/@default/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });
  return res.ok;
}
