// =============================================================================
// Rate limiting  [SPEC §C-11.1, S5] — decisión D-1: Upstash Redis (serverless).
// Dos límites: por usuario (~60 req/min) y global por proveedor de IA (burst guard
// adicional al pre-check de créditos y al conteo diario del router).
// Si Upstash no está configurado (dev/local), degrada a "permitir" registrando aviso.
// =============================================================================

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '../observability/logger';

let redis: Redis | null = null;
let userLimiter: Ratelimit | null = null;
let providerLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getUserLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!userLimiter) {
    userLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:user',
      analytics: false,
    });
  }
  return userLimiter;
}

function getProviderLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!providerLimiter) {
    providerLimiter = new Ratelimit({
      redis: r,
      // Burst global por proveedor; la cuota diaria la controla el router (§C-10.3).
      limiter: Ratelimit.slidingWindow(1000, '1 m'),
      prefix: 'rl:provider',
      analytics: false,
    });
  }
  return providerLimiter;
}

export interface RateResult {
  success: boolean;
}

/** Límite por usuario (§C-11.1). */
export async function limitUser(userId: string): Promise<RateResult> {
  const l = getUserLimiter();
  if (!l) {
    logger.warn({ event: 'ratelimit.disabled', user_id: userId });
    return { success: true };
  }
  const { success } = await l.limit(userId);
  return { success };
}

/** Límite global por proveedor de IA (§C-11.1, S5). */
export async function limitProvider(provider: string): Promise<RateResult> {
  const l = getProviderLimiter();
  if (!l) return { success: true };
  const { success } = await l.limit(provider);
  return { success };
}
