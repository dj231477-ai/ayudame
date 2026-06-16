import { type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { listTasks } from '@/lib/google/tasks';

// SPEC §C-11.5: lista tareas del usuario (Google Tasks).
export const dynamic = 'force-dynamic';

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const tasks = await listTasks(ctx.userId);
    return ok({ tasks });
  } catch (e) {
    return fail(e, locale);
  }
}
