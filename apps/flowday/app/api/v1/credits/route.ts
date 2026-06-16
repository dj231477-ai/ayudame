import { type Locale } from '@flowday/core/errors';
import { usdToCredits } from '@flowday/core/credits/pricing';
import { requireUser, ok, fail } from '@/lib/api/respond';

// SPEC §C-11.4: saldo actual y resumen de consumo.
export const dynamic = 'force-dynamic';

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const { data } = await ctx.supabase
      .from('credits')
      .select('balance, total_purchased, total_spent')
      .eq('user_id', ctx.userId)
      .single();
    const balance = data?.balance ?? 0;
    return ok({
      balance,
      credits_display: usdToCredits(balance),
      total_purchased: data?.total_purchased ?? 0,
      total_spent: data?.total_spent ?? 0,
    });
  } catch (e) {
    return fail(e, locale);
  }
}
