// =============================================================================
// Contabilidad de uso de IA por proveedor/día  [NORMATIVO — SPEC §C-10.3, F2, E4]
// getDailyUsage(provider): lee ai_daily_usage para (provider, current_date); ausencia => 0.
// La UNIDAD difiere por proveedor (§C-10.3): cerebras se limita por tokens; el resto por
// nº de requests. PROVIDER_LIMIT_UNIT documenta esa decisión.
// incrementUsage: incremento atómico vía RPC increment_ai_usage.
// =============================================================================

import { createServiceClient } from '../auth';
import { logger } from '../observability/logger';
import type { AIProviderName } from './types';

export type LimitUnit = 'requests' | 'tokens';

export const PROVIDER_LIMIT_UNIT: Record<AIProviderName, LimitUnit> = {
  gemini: 'requests',
  groq: 'requests',
  cerebras: 'tokens',
  ollama: 'requests',
};

/** Uso de hoy en la unidad límite del proveedor (requests o tokens). Ausencia => 0. */
export async function getDailyUsage(provider: AIProviderName): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from('ai_daily_usage')
    .select('request_count, token_count')
    .eq('provider', provider)
    .eq('date', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (!data) return 0;
  return PROVIDER_LIMIT_UNIT[provider] === 'tokens' ? data.token_count : data.request_count;
}

/** Incremento atómico de uso (request +1, tokens += n) vía RPC (E4). */
export async function incrementUsage(provider: AIProviderName, tokens: number): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.rpc('increment_ai_usage', {
    p_provider: provider,
    p_tokens: Math.max(0, Math.round(tokens)),
  });
  if (error) {
    // No es ruta crítica para el usuario; se registra pero no se propaga.
    logger.warn({ event: 'ai.usage_increment_failed', provider, error: { code: 'internal' } });
  }
}
