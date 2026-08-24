import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';

// SPEC §C-11.14 (D-11): ajustes propios editables desde Ajustes.
export const dynamic = 'force-dynamic';

const PROFILE_SELECT = 'id,full_name,handle,plan,streak,timezone,locale,frequent_reminders';

const PatchBody = z.object({
  frequent_reminders: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;

    const parsed = PatchBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });
    if (Object.keys(parsed.data).length === 0) throw new AppError('bad_request', { reason: 'empty_update' });

    const { data, error } = await ctx.supabase
      .from('profiles')
      .update(parsed.data)
      .eq('id', ctx.userId)
      .select(PROFILE_SELECT)
      .single();
    if (error || !data) throw new AppError('internal');
    return ok(data);
  } catch (e) {
    return fail(e, locale);
  }
}
