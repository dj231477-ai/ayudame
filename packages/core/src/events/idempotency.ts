// =============================================================================
// Idempotencia de eventos  [NORMATIVO — SPEC §C-12.4, INV-6]
// Procesar dos veces el mismo event_id produce el mismo estado final que una vez.
// Patrón "claim-first": se reclama el event_id (PK) antes de ejecutar el efecto; si
// el efecto falla, se libera el claim para permitir un reintento.
// =============================================================================

import { createServiceClient } from '../auth';
import { logger } from '../observability/logger';

export type EventSource = 'stripe' | 'n8n';

/** ¿Ya se procesó este evento? (lectura simple). */
export async function hasProcessed(eventId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from('processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();
  return data !== null;
}

/**
 * Ejecuta `effect` exactamente una vez para `eventId` (INV-6).
 * Devuelve { processed:false } si el evento ya fue reclamado/procesado (no-op, 200).
 * Si `effect` lanza, libera el claim para que un reintento pueda reprocesar.
 */
export async function processOnce(
  eventId: string,
  source: EventSource,
  effect: () => Promise<void>,
): Promise<{ processed: boolean }> {
  const db = createServiceClient();

  const { error: claimErr } = await db
    .from('processed_events')
    .insert({ event_id: eventId, source });

  if (claimErr) {
    // Conflicto de PK => ya reclamado/procesado por otra ejecución.
    logger.info({ event: 'idempotency.duplicate', request_id: eventId, provider: source });
    return { processed: false };
  }

  try {
    await effect();
    return { processed: true };
  } catch (e) {
    await db.from('processed_events').delete().eq('event_id', eventId);
    logger.error({
      event: 'idempotency.effect_failed',
      request_id: eventId,
      provider: source,
      error: { code: 'internal' },
    });
    throw e;
  }
}
