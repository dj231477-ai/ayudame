import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { listUpcomingEvents } from '@/lib/google/calendar';
import { localDate } from '@/lib/datetime';

// Calendar (Pro+): eventos próximos + detección de conflictos con bloques (§C-1.2 #8).
export const dynamic = 'force-dynamic';

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('plan, timezone')
      .eq('id', ctx.userId)
      .single();
    const plan = profile?.plan ?? 'free';
    if (plan !== 'pro' && plan !== 'team') throw new AppError('forbidden_plan');

    const tz = profile?.timezone ?? 'America/Bogota';
    const events = await listUpcomingEvents(ctx.userId);

    const today = localDate(new Date(), tz);
    const { data: blocks } = await ctx.supabase
      .from('blocks')
      .select('id, start_time, end_time, date')
      .eq('user_id', ctx.userId)
      .eq('date', today);

    // Conflictos: solapamiento entre un bloque y un evento con horas concretas.
    const conflicts: Array<{ block_id: string; event_id: string }> = [];
    for (const b of blocks ?? []) {
      const bStart = new Date(`${b.date}T${b.start_time}`).getTime();
      const bEnd = new Date(`${b.date}T${b.end_time}`).getTime();
      for (const e of events) {
        if (!e.start || !e.end) continue;
        const eStart = new Date(e.start).getTime();
        const eEnd = new Date(e.end).getTime();
        if (bStart < eEnd && eStart < bEnd) {
          conflicts.push({ block_id: b.id, event_id: e.id });
        }
      }
    }

    return ok({ events, conflicts });
  } catch (e) {
    return fail(e, locale);
  }
}
