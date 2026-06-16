// Tipos del sistema de créditos [SPEC §C-9].
import type { ActionKey } from './pricing';

/** Resultado del pre-cobro (§C-9.5). */
export type CheckResult =
  | { allowed: false; code: 'insufficient_credits' }
  | { allowed: true; usageLogId: string; balance: number; cost: number };

export type { ActionKey };
