// =============================================================================
// Política de retención por plan  [NORMATIVO — SPEC §C-15.2]
// Días de conservación de cada tipo de dato. La consume el job de cleanup (§C-15.3).
// =============================================================================

export const RETENTION_DAYS = {
  free: { evidence_photos: 7, usage_log: 30, blocks_history: 7 },
  pro: { evidence_photos: 365, usage_log: 365, blocks_history: 365 },
  team: { evidence_photos: 730, usage_log: 730, blocks_history: 730 },
} as const;

export type RetentionPlan = keyof typeof RETENTION_DAYS;
export type RetentionDataKind = keyof (typeof RETENTION_DAYS)['free'];

/** Devuelve la fecha de corte (cutoff) para un plan/tipo de dato, desde `now`. */
export function retentionCutoff(
  plan: RetentionPlan,
  kind: RetentionDataKind,
  now: Date = new Date(),
): Date {
  const days = RETENTION_DAYS[plan][kind];
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}
