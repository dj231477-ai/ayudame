import { z } from 'zod';
import { AppError, type Locale } from '@flowday/core/errors';
import { limitUser } from '@flowday/core/ratelimit';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { verifyPhoto } from '@/lib/verify-photo';

// SPEC §C-11.3 (núcleo del producto). Orden NORMATIVO.
export const dynamic = 'force-dynamic';

const Body = z.object({
  block_id: z.string().uuid(),
  photo_path: z.string().min(1),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const { userId, supabase } = ctx;

    const rl = await limitUser(userId); // §C-11.1
    if (!rl.success) throw new AppError('rate_limited');

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('bad_request', { issues: parsed.error.flatten() });

    // Normaliza ruta (con/sin prefijo de bucket) y valida pertenencia a la carpeta del usuario (S4).
    const rel = parsed.data.photo_path.replace(/^evidence-photos\//, '');
    if (!rel.startsWith(`${userId}/`)) {
      throw new AppError('bad_request', { reason: 'photo_path_owner_mismatch' });
    }

    // (1) bloque del usuario + estado awaiting_photo (RLS asegura propiedad).
    const { data: block, error } = await supabase
      .from('blocks')
      .select('id, type, label, status')
      .eq('id', parsed.data.block_id)
      .single();
    if (error || !block) throw new AppError('not_found');
    if (block.status !== 'awaiting_photo') throw new AppError('block_state_invalid');

    const result = await verifyPhoto({
      userId,
      blockId: block.id,
      photoPath: rel,
      blockType: block.type,
      taskName: block.label,
    });

    logger.info({
      event: 'verify.ok',
      request_id: requestId,
      user_id: userId,
      route: '/api/v1/verify-photo',
    });
    return ok(result);
  } catch (e) {
    logger.warn({
      event: 'verify.error',
      request_id: requestId,
      route: '/api/v1/verify-photo',
      error: { code: e instanceof AppError ? e.code : 'internal' },
    });
    return fail(e, locale);
  }
}
