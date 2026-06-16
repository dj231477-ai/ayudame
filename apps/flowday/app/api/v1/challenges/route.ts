import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { listChallengesWithLeaderboard, userPlan } from '@/lib/challenges';

// Challenges (Team, §C-1.2 #10, §C-9.2). Versionado bajo /api/v1.
export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const challenges = await listChallengesWithLeaderboard(ctx.supabase);
    return ok({ challenges });
  } catch (e) {
    return fail(e, locale);
  }
}

export async function POST(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    if ((await userPlan(ctx.supabase, ctx.userId)) !== 'team') throw new AppError('forbidden_plan');

    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    const { data: challenge, error } = await ctx.supabase
      .from('challenges')
      .insert({ owner_id: ctx.userId, ...parsed.data })
      .select('id, name, start_date, end_date, owner_id')
      .single();
    if (error || !challenge) throw new AppError('internal');

    // El owner se une automáticamente (insert_self por RLS).
    await ctx.supabase.from('challenge_members').insert({
      challenge_id: challenge.id,
      user_id: ctx.userId,
    });
    return ok(challenge, { status: 201 });
  } catch (e) {
    return fail(e, locale);
  }
}
