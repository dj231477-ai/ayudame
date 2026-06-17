import { logger, newRequestId } from '@flowday/core/observability/logger';
import { authorizeInternal } from '@/lib/internal-auth';
import { runMonetizationTriggers } from '@/lib/monetization';

// SPEC §C-11.7 / §C-9.7: ejecuta los triggers de monetización. Llamado por n8n (monetization.json).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!authorizeInternal(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }
  try {
    const result = await runMonetizationTriggers();
    logger.info({ event: 'monetization.run', request_id: requestId, route: '/internal/monetization/run' });
    return Response.json({ ok: true, ...result });
  } catch {
    logger.error({ event: 'monetization.failed', request_id: requestId, error: { code: 'internal' } });
    return Response.json({ error: { code: 'internal', message: 'monetization error' } }, { status: 500 });
  }
}
