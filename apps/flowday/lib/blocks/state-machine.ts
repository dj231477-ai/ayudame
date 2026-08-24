// =============================================================================
// Máquina de estados del bloque  [NORMATIVO — SPEC §C-13.2, D-10]
// Transiciones válidas:
//   pending→awaiting_start_photo, awaiting_start_photo→active, awaiting_start_photo→skipped,
//   active→awaiting_photo, awaiting_photo→verified,
//   active→skipped, awaiting_photo→skipped.  Cualquier otra ⇒ block_state_invalid (409).
// =============================================================================

import type { BlockStatus } from '@flowday/core/supabase/types';

// D-10, §C-13.5: minutos comunicados al usuario para cada foto (inicio y fin). Plazo duro
// para awaiting_start_photo (auto-skip al vencer); guía sin consecuencia dura para awaiting_photo
// (INV-11: nunca se auto-marca). Fuente única — nunca hardcodear "15" en otro archivo.
export const PHOTO_WINDOW_MIN = 15;

const VALID_TRANSITIONS: Record<BlockStatus, readonly BlockStatus[]> = {
  pending: ['awaiting_start_photo'],
  awaiting_start_photo: ['active', 'skipped'],
  active: ['awaiting_photo', 'skipped'],
  awaiting_photo: ['verified', 'skipped'],
  verified: [],
  skipped: [],
};

// `from` se acepta como string porque proviene de columnas de texto de la DB (blocks.status
// no tiene CHECK). La guarda `?? []` evita un fallo en runtime si llegara un estado desconocido.
export function canTransition(from: string, to: BlockStatus): boolean {
  return (VALID_TRANSITIONS[from as BlockStatus] ?? []).includes(to);
}

export const BLOCK_STATUSES: readonly BlockStatus[] = [
  'pending',
  'awaiting_start_photo',
  'active',
  'awaiting_photo',
  'verified',
  'skipped',
];
