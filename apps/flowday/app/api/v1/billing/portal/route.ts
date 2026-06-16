import { type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { createPortal } from '@/lib/billing';

// SPEC §C-11.4: crea sesión del Billing Portal de Stripe.
export const dynamic = 'force-dynamic';

export async function POST() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const url = await createPortal(ctx.userId);
    return ok({ url });
  } catch (e) {
    return fail(e, locale);
  }
}
