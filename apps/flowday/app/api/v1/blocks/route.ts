import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';

// SPEC §C-11.2 (Bloques).
export const dynamic = 'force-dynamic';

const BLOCK_SELECT = 'id,date,start_time,end_time,label,type,task_id,status';

const CreateBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  label: z.string().min(1).max(200),
  type: z.enum(['deep', 'admin', 'body', 'rest', 'review']),
  task_id: z.string().optional(),
});

export async function GET(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const date = new URL(request.url).searchParams.get('date');
    let query = ctx.supabase
      .from('blocks')
      .select(BLOCK_SELECT)
      .eq('user_id', ctx.userId)
      .order('start_time', { ascending: true });
    if (date) query = query.eq('date', date);
    const { data, error } = await query;
    if (error) throw new AppError('internal');
    return ok({ blocks: data ?? [] });
  } catch (e) {
    return fail(e, locale);
  }
}

export async function POST(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    const { data, error } = await ctx.supabase
      .from('blocks')
      .insert({ user_id: ctx.userId, ...parsed.data })
      .select(BLOCK_SELECT)
      .single();
    if (error || !data) throw new AppError('internal');
    return ok(data, { status: 201 });
  } catch (e) {
    return fail(e, locale);
  }
}
