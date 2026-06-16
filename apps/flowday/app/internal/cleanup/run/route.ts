import { logger, newRequestId } from '@flowday/core/observability/logger';
import { runCleanup } from '@/lib/cleanup';

// SPEC §C-11.7 / §C-15.3: ejecuta la retención (borrado por lotes). Llamado por n8n (data-cleanup.json).
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // borrado por lotes puede tardar

function authorized(request: Request): boolean {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  const provided = request.headers.get('x-internal-secret');
  return Boolean(secret && provided && secret === provided);
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!authorized(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }
  try {
    const result = await runCleanup();
    logger.info({ event: 'cleanup.run', request_id: requestId, route: '/internal/cleanup/run' });
    return Response.json({ ok: true, ...result });
  } catch {
    logger.error({ event: 'cleanup.failed', request_id: requestId, error: { code: 'internal' } });
    return Response.json({ error: { code: 'internal', message: 'cleanup error' } }, { status: 500 });
  }
}
