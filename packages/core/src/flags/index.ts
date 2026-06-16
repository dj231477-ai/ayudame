// =============================================================================
// Feature flags  [NORMATIVO en efectos — SPEC §C-9.7, §C-19.5]
// Estado global de activación de features/tiers. setFlag registra evento en
// monetization_events. La UI lee flags vía backend (nunca directo). Tabla interna.
// =============================================================================

import { createServiceClient } from '../auth';
import type { Json } from '../supabase/types';

export async function getFlag(key: string): Promise<Json | null> {
  const svc = createServiceClient();
  const { data } = await svc.from('feature_flags').select('value').eq('key', key).maybeSingle();
  return data ? data.value : null;
}

export async function isFlagEnabled(key: string): Promise<boolean> {
  const value = await getFlag(key);
  return value === true;
}

export async function setFlag(key: string, value: Json): Promise<void> {
  const svc = createServiceClient();
  await svc.from('feature_flags').upsert({ key, value }, { onConflict: 'key' });
  await svc.from('monetization_events').insert({
    event_type: 'flag_set',
    payload: { key, value },
  });
}
