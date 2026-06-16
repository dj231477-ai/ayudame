import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { userPlan } from '@/lib/challenges';

// Unirse a un challenge (Team). El "accountability partner" es un challenge de 2 miembros.
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    if ((await userPlan(ctx.supabase, ctx.userId)) !== 'team') throw new AppError('forbidden_plan');

    const { id } = await params;
    const { error } = await ctx.supabase
      .from('challenge_members')
      .insert({ challenge_id: id, user_id: ctx.userId });
    if (error) throw new AppError('internal');
    return ok({ joined: true });
  } catch (e) {
    return fail(e, locale);
  }
}
