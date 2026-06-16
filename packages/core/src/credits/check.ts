// =============================================================================
// Pre-cobro y reembolso de créditos  [NORMATIVO — SPEC §C-9.5, §C-9.6]
// INV-2: ninguna llamada a IA ocurre sin pasar antes por checkAndDeductCredits.
// El descuento es atómico (RPC deduct_credits); sin saldo suficiente, no se llama a IA.
// =============================================================================

import { createServiceClient } from '../auth';
import { AppError } from '../errors';
import { logger } from '../observability/logger';
import type { AIProviderName } from '../supabase/types';
import { ACTION_COSTS, ACTION_COSTS_REAL, MARGIN, type ActionKey } from './pricing';
import type { CheckResult } from './types';

/**
 * Descuenta el coste de `action` del saldo del usuario y registra el consumo.
 * Devuelve { allowed:false } si no hay saldo (INV-2). Atómico vía RPC (§C-14.4).
 */
export async function checkAndDeductCredits(
  userId: string,
  action: ActionKey,
  provider: AIProviderName,
): Promise<CheckResult> {
  const cost = ACTION_COSTS[action];
  const db = createServiceClient();

  // Descuento atómico; lanza 'insufficient_credits' si no alcanza (INV-2).
  let newBalance: number;
  try {
    const { data, error } = await db.rpc('deduct_credits', { p_user_id: userId, p_amount: cost });
    if (error) throw error;
    newBalance = data;
  } catch {
    logger.info({ event: 'credits.insufficient', user_id: userId, error: { code: 'insufficient_credits' } });
    return { allowed: false, code: 'insufficient_credits' };
  }

  const { data: log, error: logErr } = await db
    .from('usage_log')
    .insert({
      user_id: userId,
      action,
      provider,
      cost_charged: cost,
      cost_real: ACTION_COSTS_REAL[action],
      margin: MARGIN,
    })
    .select('id')
    .single();

  if (logErr || !log) {
    // Cobramos pero no pudimos registrar el consumo: reembolsa y trata como fallo del sistema (§C-9.6).
    await db.rpc('refund_credits', { p_user_id: userId, p_amount: cost, p_usage_log_id: null });
    logger.error({ event: 'credits.usage_log_insert_failed', user_id: userId, error: { code: 'internal' } });
    throw new AppError('internal');
  }

  return { allowed: true, usageLogId: log.id, balance: newBalance, cost };
}

/**
 * Reembolsa créditos por fallo del sistema (timeout/5xx/cuota global) (§C-9.6, §C-14.3).
 * No se usa para rechazos legítimos de contenido (esos sí se cobran).
 */
export async function refundCredits(userId: string, amount: number, usageLogId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_usage_log_id: usageLogId,
  });
  if (error) {
    logger.error({ event: 'credits.refund_failed', user_id: userId, error: { code: 'internal' } });
    throw new AppError('internal');
  }
  logger.info({ event: 'credits.refunded', user_id: userId });
}
