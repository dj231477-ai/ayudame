import 'server-only';
import type { FlowDayClient } from '@flowday/core/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@flowday/core/observability/logger';

// GDPR (§C-15.4): exportación (derecho de acceso) y borrado de cuenta end-to-end.

export async function exportUserData(supabase: FlowDayClient, userId: string) {
  // Lecturas con el cliente del usuario (RLS): solo sus propios datos.
  const [profile, credits, subscriptions, blocks, evidence, habits, usage, purchases] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('credits').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('blocks').select('*').eq('user_id', userId),
    supabase.from('evidence').select('id, block_id, verified, confidence, verification_msg, provider, created_at').eq('user_id', userId),
    supabase.from('habits').select('*').eq('user_id', userId),
    supabase.from('usage_log').select('*').eq('user_id', userId),
    supabase.from('credit_purchases').select('*').eq('user_id', userId),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    credits: credits.data,
    subscription: subscriptions.data,
    blocks: blocks.data ?? [],
    evidence: evidence.data ?? [], // metadatos, no binarios de foto
    habits: habits.data ?? [],
    usage_log: usage.data ?? [],
    credit_purchases: purchases.data ?? [],
  };
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const svc = createServiceClient();

  // 1) Borrar fotos de Storage del usuario.
  const { data: ev } = await svc.from('evidence').select('photo_path').eq('user_id', userId);
  const paths = (ev ?? []).map((e) => e.photo_path);
  if (paths.length > 0) {
    await svc.storage.from('evidence-photos').remove(paths);
  }

  // 2) Registro mínimo NO-personal (sin PII) (§C-15.4).
  await svc.from('monetization_events').insert({ event_type: 'account_deleted', payload: {} });

  // 3) Borrar el usuario de auth ⇒ cascade elimina profiles y todo lo dependiente; revoca sesiones.
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) {
    logger.error({ event: 'account.delete_failed', user_id: userId, error: { code: 'internal' } });
    throw error;
  }
  logger.info({ event: 'account.deleted', user_id: userId });
}
