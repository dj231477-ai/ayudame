import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { canTransition } from '@/lib/blocks/state-machine';

// SPEC §C-11.2 (PATCH/DELETE de bloque) + §C-13.2 (máquina de estados).
export const dynamic = 'force-dynamic';

const BLOCK_SELECT = 'id,date,start_time,end_time,label,type,task_id,status';

const PatchBody = z.object({
  status: z.enum(['pending', 'active', 'awaiting_photo', 'verified', 'skipped']).optional(),
  label: z.string().min(1).max(200).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  type: z.enum(['deep', 'admin', 'body', 'rest', 'review']).optional(),
  task_id: z.string().nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const { id } = await params;

    const parsed = PatchBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    const { data: current, error: curErr } = await ctx.supabase
      .from('blocks')
      .select('status')
      .eq('id', id)
      .single();
    if (curErr || !current) throw new AppError('not_found');

    const update: Record<string, unknown> = {};

    if (parsed.data.status !== undefined && parsed.data.status !== current.status) {
      // 'verified' SOLO se alcanza vía verify-photo (no por PATCH): preserva la honestidad del historial.
      if (parsed.data.status === 'verified') throw new AppError('block_state_invalid');
      if (!canTransition(current.status, parsed.data.status)) {
        throw new AppError('block_state_invalid');
      }
      update.status = parsed.data.status;
    }
    if (parsed.data.label !== undefined) update.label = parsed.data.label;
    if (parsed.data.start_time !== undefined) update.start_time = parsed.data.start_time;
    if (parsed.data.end_time !== undefined) update.end_time = parsed.data.end_time;
    if (parsed.data.type !== undefined) update.type = parsed.data.type;
    if (parsed.data.task_id !== undefined) update.task_id = parsed.data.task_id;

    if (Object.keys(update).length === 0) throw new AppError('bad_request', { reason: 'empty_update' });

    const { data, error } = await ctx.supabase
      .from('blocks')
      .update(update)
      .eq('id', id)
      .select(BLOCK_SELECT)
      .single();
    if (error || !data) throw new AppError('internal');
    return ok(data);
  } catch (e) {
    return fail(e, locale);
  }
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const { id } = await params;

    // §C-11.2: no borrar evidencia histórica (INV-11). Si el bloque tiene evidencia, rechazar.
    const { data: ev } = await ctx.supabase.from('evidence').select('id').eq('block_id', id).limit(1);
    if (ev && ev.length > 0) throw new AppError('block_state_invalid');

    const { error } = await ctx.supabase.from('blocks').delete().eq('id', id);
    if (error) throw new AppError('internal');
    return ok({ deleted: true });
  } catch (e) {
    return fail(e, locale);
  }
}
