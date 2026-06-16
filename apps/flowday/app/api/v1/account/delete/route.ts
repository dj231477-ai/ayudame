import { type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { deleteUserAccount } from '@/lib/account';

// SPEC §C-15.4: borrado de cuenta (GDPR) end-to-end.
export const dynamic = 'force-dynamic';

export async function POST() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    await deleteUserAccount(ctx.userId);
    await ctx.supabase.auth.signOut();
    return ok({ deleted: true });
  } catch (e) {
    return fail(e, locale);
  }
}
