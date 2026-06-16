import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { limitUser } from '@flowday/core/ratelimit';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { createCheckout } from '@/lib/billing';

// SPEC §C-11.4: crea Checkout Session. Acepta Idempotency-Key.
export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.enum(['package', 'subscription']),
  id: z.string().min(1),
  seats: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const rl = await limitUser(ctx.userId);
    if (!rl.success) throw new AppError('rate_limited');

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    const url = await createCheckout({
      kind: parsed.data.kind,
      id: parsed.data.id,
      seats: parsed.data.seats,
      userId: ctx.userId,
      email: ctx.email,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
    });
    return ok({ url });
  } catch (e) {
    return fail(e, locale);
  }
}
