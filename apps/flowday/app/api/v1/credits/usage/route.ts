import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';

// SPEC §C-11.4: historial de usage_log paginado (?from&to).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let query = ctx.supabase
      .from('usage_log')
      .select('id, action, provider, model, cost_charged, refunded, created_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw new AppError('internal');
    return ok({ usage: data ?? [] });
  } catch (e) {
    return fail(e, locale);
  }
}
