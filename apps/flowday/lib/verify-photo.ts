import 'server-only';
import { callAI } from '@flowday/core/ai/router';
import { AppError } from '@flowday/core/errors';
import { logger } from '@flowday/core/observability/logger';
import { createServiceClient } from '@/lib/supabase/service';
import { localDate, addDays } from '@/lib/datetime';
import { buildVerifyPrompt, parseVerifyResponse } from '@/lib/verify-prompt';

// =============================================================================
// Verificación de foto  [NORMATIVO — SPEC §C-11.3, §C-13.3, §C-13.4]
// VERIFY_PROMPT recibe el TYPE del bloque (enum seguro) en `system` y el nombre de la
// tarea como `userData` (nunca interpolado, §C-10.5 / S3). Helpers puros en ./verify-prompt.
// =============================================================================

export interface VerifyPhotoInput {
  userId: string;
  blockId: string;
  photoPath: string; // ruta dentro del bucket: {user_id}/{block_id}/{ts}.jpg
  blockType: string;
  taskName: string;
  /**
   * true cuando el reproceso viene del drenado de verification_queue (§C-14.3): en ese caso
   * NO se vuelve a encolar al agotarse la visión (la fila ya está en la cola), solo se propaga.
   */
  fromQueue?: boolean;
}

export interface VerifyPhotoResult {
  verified: boolean;
  confidence: number;
  message: string;
  balance: number;
}

export async function verifyPhoto(input: VerifyPhotoInput): Promise<VerifyPhotoResult> {
  const svc = createServiceClient();

  // (2) URL firmada ≤ 60 s (§C-8.5). El verificador accede vía backend, nunca URL pública.
  const { data: signed, error: signErr } = await svc.storage
    .from('evidence-photos')
    .createSignedUrl(input.photoPath, 60);
  if (signErr || !signed) {
    logger.error({ event: 'verify.sign_url_failed', user_id: input.userId, error: { code: 'internal' } });
    throw new AppError('internal');
  }

  // (3) callAI con pre-cobro (INV-2). ai_vision_exhausted ⇒ encolar y propagar SIN cobrar (§C-14.3).
  let ai: Awaited<ReturnType<typeof callAI>>;
  try {
    ai = await callAI(input.userId, 'photo_verify', {
      modality: 'vision',
      system: buildVerifyPrompt(input.blockType),
      userData: input.taskName,
      imageUrl: signed.signedUrl,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === 'ai_vision_exhausted' && !input.fromQueue) {
      await svc.from('verification_queue').insert({
        user_id: input.userId,
        block_id: input.blockId,
        photo_path: input.photoPath,
      });
      logger.warn({ event: 'verify.enqueued_vision_exhausted', user_id: input.userId });
    }
    throw e;
  }

  // (4) parse
  const parsed = parseVerifyResponse(ai.text);

  // (5) evidence (append-only, INV-11) enlazada al consumo cobrado.
  const { error: evErr } = await svc.from('evidence').insert({
    block_id: input.blockId,
    user_id: input.userId,
    photo_path: input.photoPath,
    verified: parsed.verified,
    confidence: parsed.confidence,
    verification_msg: parsed.message,
    provider: ai.provider,
    usage_log_id: ai.usageLogId,
  });
  if (evErr) {
    logger.error({ event: 'verify.evidence_insert_failed', user_id: input.userId, error: { code: 'internal' } });
    throw new AppError('internal');
  }

  // (6) verified ⇒ transición + streak (≤ 1/día, §C-13.3).
  if (parsed.verified) {
    await svc.from('blocks').update({ status: 'verified' }).eq('id', input.blockId);
    await updateStreak(input.userId);
  }

  // (7) saldo actual
  const { data: credits } = await svc
    .from('credits')
    .select('balance')
    .eq('user_id', input.userId)
    .single();

  return {
    verified: parsed.verified,
    confidence: parsed.confidence,
    message: parsed.message,
    balance: credits?.balance ?? 0,
  };
}

/**
 * Streak [NORMATIVO §C-13.3]: días consecutivos con ≥1 bloque verified, en tz del usuario.
 * Incrementa como máximo una vez por día; si ayer no hubo verified, reinicia a 1.
 * (El reinicio a 0 por día perdido sin verificar lo aplica el job diario de n8n, Fase 2.)
 */
async function updateStreak(userId: string): Promise<void> {
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from('profiles')
    .select('streak, timezone')
    .eq('id', userId)
    .single();
  if (!profile) return;

  const tz = profile.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const yesterday = localDate(addDays(now, -1), tz);

  const { data: rows } = await svc
    .from('evidence')
    .select('created_at')
    .eq('user_id', userId)
    .eq('verified', true)
    .gte('created_at', addDays(now, -3).toISOString());

  const all = rows ?? [];
  const verifiedTodayCount = all.filter((r) => localDate(new Date(r.created_at), tz) === today).length;
  // Si ya había verificación hoy ANTES de esta, el streak ya se contó (≤ 1/día).
  if (verifiedTodayCount > 1) return;

  const verifiedYesterday = all.some((r) => localDate(new Date(r.created_at), tz) === yesterday);
  const newStreak = verifiedYesterday ? profile.streak + 1 : 1;
  await svc.from('profiles').update({ streak: newStreak }).eq('id', userId);
}
