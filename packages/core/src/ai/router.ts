// =============================================================================
// Router de IA  [NORMATIVO — SPEC §C-10.3, §C-10.4]
// Única puerta para llamar IA en el producto. n8n nunca elige proveedor (§C-10.1).
// INV-2 (pre-cobro), INV-7 (visión nunca a Ollama), §C-9.6 (reembolso por fallo).
// Ollama descartado (D-9): latencia inaceptable. MiniMax M3 es el único fallback de pago,
// gateado por el flag `vision_paid_fallback_active` (D-2, extendido a texto en D-9).
// =============================================================================

import { AppError } from '../errors';
import { logger } from '../observability/logger';
import { checkAndDeductCredits, refundCredits } from '../credits/check';
import type { ActionKey } from '../credits/pricing';
import { limitProvider } from '../ratelimit';
import { isFlagEnabled } from '../flags';
import { buildPrompt } from './prompt';
import { withRetry } from './retry';
import { incrementUsage, getDailyUsage } from './usage';
import type { AIModality, AIProvider, AIRequest, AIResponse, ProviderDispatch } from './types';
import { dispatchGemini } from './providers/gemini';
import { dispatchGroq } from './providers/groq';
import { dispatchCerebras } from './providers/cerebras';
import { dispatchMinimax } from './providers/minimax';

// Umbrales por debajo del límite real para dejar margen de seguridad (§C-10.6).
const TEXT_GROQ_LIMIT = 900;
const TEXT_CEREBRAS_TOKEN_LIMIT = 900_000;
const MINIMAX_MODEL = 'MiniMax-M3';
const PAID_FALLBACK_FLAG = 'vision_paid_fallback_active'; // D-2/D-9: gatea MiniMax en ambas modalidades.

/** Selección de proveedor [NORMATIVO §C-10.3]. Visión SOLO cloud; nunca Ollama (INV-7). */
export async function getAIProvider(modality: AIModality): Promise<AIProvider> {
  if (modality === 'vision') {
    // Siempre Gemini Flash; sin fallback Claude (eliminado, D-2). Visión nunca a Ollama (INV-7).
    // La cuota agotada se maneja en dispatch (Gemini 429 -> ai_vision_exhausted), que callAI
    // atrapa y reintenta con MiniMax M3 si el flag está activo (D-2, §C-14.3).
    // Modelo actualizado a gemini-3.6-flash: gemini-2.5-flash quedó deprecado (confirmado con el
    // E2E de Playwright real contra la API, agosto 2026 — posterior a este fallback de v2.1).
    return { provider: 'gemini', model: 'gemini-3.6-flash' };
  }
  // Texto: rotación por cuota diaria (sin ruta especial para el fundador — Ollama, que la
  // servía, quedó descartado por latencia, D-9).
  // D-27: 'llama-3.3-70b-versatile'/'llama3.1-70b' ya no existen en las cuentas reales de
  // Groq/Cerebras (ambas devolvían 404 model_not_found — confirmado en vivo, agosto 2026).
  // Modelos vigentes según /v1/models de cada cuenta.
  if ((await getDailyUsage('groq')) < TEXT_GROQ_LIMIT) {
    return { provider: 'groq', model: 'openai/gpt-oss-20b' };
  }
  if ((await getDailyUsage('cerebras')) < TEXT_CEREBRAS_TOKEN_LIMIT) {
    return { provider: 'cerebras', model: 'gemma-4-31b' };
  }
  // Groq y Cerebras agotados el mismo día: sin Ollama no queda alternativa gratuita (D-9).
  // Con el flag de pago activo, MiniMax M3 sirve también texto; si no, degradación explícita.
  if (await isFlagEnabled(PAID_FALLBACK_FLAG)) {
    return { provider: 'minimax', model: MINIMAX_MODEL };
  }
  throw new AppError('ai_text_exhausted'); // antes de cobrar (INV-2) — no hay reembolso que hacer.
}

const DISPATCH: Record<AIProvider['provider'], ProviderDispatch> = {
  gemini: dispatchGemini,
  groq: dispatchGroq,
  cerebras: dispatchCerebras,
  minimax: dispatchMinimax,
};

/**
 * Ejecuta `primary`; si falla por agotamiento (ai_vision_exhausted) y el fallback de pago
 * está activo, reintenta una vez con MiniMax M3 (D-2). Solo aplica a visión: en texto la
 * decisión ya se tomó en getAIProvider (allí no hay retry post-dispatch que hacer).
 */
async function dispatchWithFallback(
  primary: AIProvider,
  prompt: string,
  req: AIRequest,
): Promise<AIResponse> {
  try {
    return await withRetry(() => DISPATCH[primary.provider](primary.model, prompt, req));
  } catch (e) {
    const exhausted = req.modality === 'vision' ? 'ai_vision_exhausted' : 'ai_text_exhausted';
    const canFallback = primary.provider !== 'minimax' && e instanceof AppError && e.code === exhausted;
    if (canFallback && (await isFlagEnabled(PAID_FALLBACK_FLAG))) {
      return await withRetry(() => dispatchMinimax(MINIMAX_MODEL, prompt, req));
    }
    throw e;
  }
}

/**
 * Resultado de callAI = AIResponse (§C-10.2) + usageLogId.
 * Se expone usageLogId porque §C-11.3 paso 5 exige enlazar evidence.usage_log_id al
 * consumo que §C-10.4 crea internamente; es un superconjunto estructural de AIResponse.
 */
export type CallAIResult = AIResponse & { usageLogId: string };

/** Ejecución con cobro, reintentos y contabilidad [NORMATIVO §C-10.4]. */
export async function callAI(
  userId: string,
  action: ActionKey,
  req: AIRequest,
): Promise<CallAIResult> {
  const provider = await getAIProvider(req.modality);
  // S5: burst guard global por proveedor; degrada graceful si Upstash no está (§C-11.1).
  const providerLimit = await limitProvider(provider.provider);
  if (!providerLimit.success) throw new AppError('rate_limited');
  const gate = await checkAndDeductCredits(userId, action, provider.provider); // INV-2
  if (!gate.allowed) throw new AppError('insufficient_credits');
  try {
    const prompt = buildPrompt(req.system, req.userData); // anti-inyección (§C-10.5)
    const res = await dispatchWithFallback(provider, prompt, req);
    await incrementUsage(res.provider, res.tokens); // E4 — res.provider: el que realmente sirvió (puede ser el fallback MiniMax).
    logger.info({ event: 'ai.call_ok', user_id: userId, provider: res.provider });
    return { ...res, usageLogId: gate.usageLogId };
  } catch (e) {
    // Fallo del sistema (timeout/5xx): reembolso; la acción no cuenta (§C-9.6).
    await refundCredits(userId, gate.cost, gate.usageLogId);
    logger.warn({
      event: 'ai.call_failed',
      user_id: userId,
      provider: provider.provider,
      error: { code: 'internal', message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
