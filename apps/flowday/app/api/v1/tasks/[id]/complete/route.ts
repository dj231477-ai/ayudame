import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { completeTask } from '@/lib/google/tasks';

// SPEC §C-11.5: marca una tarea como completada en Google Tasks.
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const { id } = await params;
    const done = await completeTask(ctx.userId, id);
    if (!done) throw new AppError('internal');
    return ok({ completed: true });
  } catch (e) {
    return fail(e, locale);
  }
}
