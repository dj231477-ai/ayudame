// =============================================================================
// Router de IA  [NORMATIVO — SPEC §C-10.3, §C-10.4]
// Única puerta para llamar IA en el producto. n8n nunca elige proveedor (§C-10.1).
// INV-2 (pre-cobro), INV-7 (visión nunca a Ollama), §C-9.6 (reembolso por fallo).
// =============================================================================

import { AppError } from '../errors';
import { logger } from '../observability/logger';
import { checkAndDeductCredits, refundCredits } from '../credits/check';
import type { ActionKey } from '../credits/pricing';
import { limitProvider } from '../ratelimit';
import { buildPrompt } from './prompt';
import { withRetry } from './retry';
import { getDailyUsage, incrementUsage } from './usage';
import type { AIModality, AIProvider, AIRequest, AIResponse, ProviderDispatch } from './types';
import { dispatchGemini } from './providers/gemini';
import { dispatchGroq } from './providers/groq';
import { dispatchCerebras } from './providers/cerebras';
import { dispatchOllama } from './providers/ollama';
import { dispatchClaude } from './providers/claude';

// Umbrales por debajo del límite real para dejar margen de seguridad (§C-10.6).
const TEXT_GROQ_LIMIT = 900;
const TEXT_CEREBRAS_TOKEN_LIMIT = 900_000;

/** Selección de proveedor [NORMATIVO §C-10.3]. Visión SOLO cloud; nunca Ollama (INV-7). */
export async function getAIProvider(modality: AIModality, userId?: string): Promise<AIProvider> {
  if (modality === 'vision') {
    // Siempre Gemini Flash para todos los usuarios (INV-7).
    return { provider: 'gemini', model: 'gemini-2.5-flash' };
  }
  // Texto fundador: Ollama local qwen3:8b (sin consumir cuota cloud).
  // Se lee en runtime para que tests y hot-reload funcionen correctamente.
  const founderUserId = process.env.FOUNDER_USER_ID;
  if (founderUserId && userId === founderUserId) {
    return { provider: 'ollama', model: 'qwen3:8b' };
  }
  // Texto usuarios: rotación por cuota diaria.
  if ((await getDailyUsage('groq')) < TEXT_GROQ_LIMIT) {
    return { provider: 'groq', model: 'llama-3.3-70b-versatile' };
  }
  if ((await getDailyUsage('cerebras')) < TEXT_CEREBRAS_TOKEN_LIMIT) {
    return { provider: 'cerebras', model: 'llama3.1-70b' };
  }
  return { provider: 'ollama', model: 'qwen3:8b' }; // best-effort, fuera de ruta crítica
}

const DISPATCH: Record<AIProvider['provider'], ProviderDispatch> = {
  gemini: dispatchGemini,
  groq: dispatchGroq,
  cerebras: dispatchCerebras,
  ollama: dispatchOllama,
  claude: dispatchClaude,
};

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
  const provider = await getAIProvider(req.modality, userId);
  // S5: burst guard global por proveedor; degrada graceful si Upstash no está (§C-11.1).
  const providerLimit = await limitProvider(provider.provider);
  if (!providerLimit.success) throw new AppError('rate_limited');
  const gate = await checkAndDeductCredits(userId, action, provider.provider); // INV-2
  if (!gate.allowed) throw new AppError('insufficient_credits');
  try {
    const prompt = buildPrompt(req.system, req.userData); // anti-inyección (§C-10.5)
    const res = await withRetry(() => DISPATCH[provider.provider](provider.model, prompt, req));
    await incrementUsage(provider.provider, res.tokens); // E4
    logger.info({ event: 'ai.call_ok', user_id: userId, provider: provider.provider });
    return { ...res, usageLogId: gate.usageLogId };
  } catch (e) {
    // Fallo del sistema (timeout/5xx): reembolso; la acción no cuenta (§C-9.6).
    await refundCredits(userId, gate.cost, gate.usageLogId);
    logger.warn({
      event: 'ai.call_failed',
      user_id: userId,
      provider: provider.provider,
      error: { code: 'internal' },
    });
    throw e;
  }
}
