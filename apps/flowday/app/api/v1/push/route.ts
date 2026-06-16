import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';

// Suscripción Web Push (§C-13.1 paso 5, AR-6). El cliente gestiona su suscripción (RLS propia).
export const dynamic = 'force-dynamic';

const SubBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const parsed = SubBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    const { error } = await ctx.supabase.from('push_subscriptions').upsert(
      {
        user_id: ctx.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get('user-agent'),
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new AppError('internal');
    return ok({ subscribed: true }, { status: 201 });
  } catch (e) {
    return fail(e, locale);
  }
}

export async function DELETE(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const endpoint = new URL(request.url).searchParams.get('endpoint');
    if (!endpoint) throw new AppError('bad_request');
    const { error } = await ctx.supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('endpoint', endpoint);
    if (error) throw new AppError('internal');
    return ok({ unsubscribed: true });
  } catch (e) {
    return fail(e, locale);
  }
}
