import 'server-only';
import { createServiceClient } from '@flowday/core/auth';
import { STIPENDS } from '@flowday/core/credits/pricing';
import { logger } from '@flowday/core/observability/logger';

/**
 * Onboarding de alta (SPEC §C-13.1 paso 4): acredita el stipend Free inicial.
 * Idempotente: grant_signup_stipend solo acredita si la cuenta nunca recibió nada
 * (INV-6), así que reintentos del callback no duplican saldo.
 * El monto vive en @flowday/core/credits/pricing.ts (INV-3), no aquí.
 */
export async function runSignupOnboarding(userId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.rpc('grant_signup_stipend', {
    p_user_id: userId,
    p_amount: STIPENDS.free,
  });
  if (error) {
    logger.error({ event: 'onboarding.stipend_failed', user_id: userId, error: { code: 'internal' } });
    return;
  }
  logger.info({ event: 'onboarding.stipend_granted', user_id: userId });
}
