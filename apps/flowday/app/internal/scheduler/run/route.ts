import { z } from 'zod';
import type { FlowDayClient } from '@flowday/core/auth';
import { AppError } from '@flowday/core/errors';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { authorizeInternal } from '@/lib/internal-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { canTransition, PHOTO_WINDOW_MIN } from '@/lib/blocks/state-machine';
import { frequentReminderDue } from '@/lib/blocks/reminder-cadence';
import { isQuietHours } from '@/lib/blocks/quiet-hours';
import { pushToUser } from '@/lib/push/send';
import { notifyWhatsAppIfLinked } from '@/lib/notify/whatsapp';
import { listTasks } from '@/lib/google/tasks';
import { verifyPhoto } from '@/lib/verify-photo';
import { getOrComputeDailyPlan } from '@/lib/planning/daily-plan';
import { localDate, localMinutes, timeToMinutes, addDays } from '@/lib/datetime';

// =============================================================================
// Scheduler interno  [SPEC §C-12.2/§C-12.5, INV-12]
// Realiza la lógica de agenda EN LA APP (AR-3). n8n solo dispara este endpoint por cron
// (firmado con INTERNAL_ADMIN_SECRET). Sigue el patrón de §C-11.7 (/internal/*).
// Jobs: schedule (start/warning/end), reminders (foto pendiente), briefing (mañana),
//       daily_reset (streak → 0 para usuarios sin verificados ese día).
// =============================================================================
export const dynamic = 'force-dynamic';

const Body = z.object({
  job: z.enum(['schedule', 'reminders', 'briefing', 'daily_reset', 'verify_queue']),
});

const TICK_WINDOW = 5; // minutos (cron cada 5 min)
const WARNING_BEFORE_END = 10; // §C-13.3 paso 3
const BRIEFING_MIN = 5 * 60; // 05:00 local
const QUEUE_BATCH = 20; // filas por corrida del drenado de verification_queue
const QUEUE_MAX_ATTEMPTS = 5; // tras este nº de intentos fallidos, la fila se marca 'failed'

export async function POST(request: Request) {
  const requestId = newRequestId();
  if (!authorizeInternal(request)) {
    return Response.json({ error: { code: 'unauthorized', message: 'invalid secret' } }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: 'bad_request', message: 'invalid job' } }, { status: 400 });
  }

  const svc = createServiceClient();
  try {
    let actions = 0;
    if (parsed.data.job === 'schedule') actions = await runSchedule(svc);
    else if (parsed.data.job === 'reminders') actions = await runReminders(svc);
    else if (parsed.data.job === 'briefing') actions = await runBriefing(svc);
    else if (parsed.data.job === 'daily_reset') actions = await runDailyReset(svc);
    else actions = await runVerifyQueue(svc);
    logger.info({ event: 'scheduler.ok', request_id: requestId, route: '/internal/scheduler/run' });
    return Response.json({ ok: true, job: parsed.data.job, actions });
  } catch {
    logger.error({ event: 'scheduler.failed', request_id: requestId, error: { code: 'internal' } });
    return Response.json({ error: { code: 'internal', message: 'scheduler error' } }, { status: 500 });
  }
}

interface UserProfile {
  timezone: string;
  name: string | null;
  frequentReminders: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

async function profileMap(svc: FlowDayClient, userIds: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  if (userIds.length === 0) return map;
  const { data } = await svc
    .from('profiles')
    .select('id, timezone, full_name, frequent_reminders, quiet_hours_start, quiet_hours_end')
    .in('id', userIds);
  for (const p of data ?? [])
    map.set(p.id, {
      timezone: p.timezone,
      name: p.full_name,
      frequentReminders: p.frequent_reminders,
      quietHoursStart: p.quiet_hours_start,
      quietHoursEnd: p.quiet_hours_end,
    });
  return map;
}

const DEFAULT_PROFILE: UserProfile = {
  timezone: 'America/Bogota',
  name: null,
  frequentReminders: false,
  quietHoursStart: null,
  quietHoursEnd: null,
};

/**
 * D-12, §C-13.5c: envía por push y (si hay WhatsApp vinculado) por WhatsApp, salvo que caiga en
 * el horario de silencio del usuario — nunca pausa transiciones de estado, solo el aviso.
 */
async function notifyUnlessQuiet(
  userId: string,
  quiet: boolean,
  push: { title: string; body: string; url: string },
  waText?: string,
): Promise<void> {
  if (quiet) return;
  await pushToUser(userId, push);
  if (waText !== undefined) await notifyWhatsAppIfLinked(userId, waText);
}

async function runSchedule(svc: FlowDayClient): Promise<number> {
  const now = new Date();
  // Ventana de fechas UTC que cubre cualquier tz.
  const dates = [localDate(addDays(now, -1), 'UTC'), localDate(now, 'UTC'), localDate(addDays(now, 1), 'UTC')];
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, user_id, start_time, end_time, label, status, date, updated_at')
    .in('status', ['pending', 'awaiting_start_photo', 'active'])
    .in('date', dates);

  const list = blocks ?? [];
  const profiles = await profileMap(svc, [...new Set(list.map((b) => b.user_id))]);
  let actions = 0;

  for (const b of list) {
    const profile = profiles.get(b.user_id) ?? DEFAULT_PROFILE;
    const zone = profile.timezone;
    const greeting = profile.name ? `${profile.name}, ` : '';
    if (b.date !== localDate(now, zone)) continue; // solo "hoy" en la tz del usuario (INV-12)

    const nowMin = localMinutes(now, zone);
    const startMin = timeToMinutes(b.start_time);
    const endMin = timeToMinutes(b.end_time);
    const warnMin = endMin - WARNING_BEFORE_END;
    const ageMin = (now.getTime() - new Date(b.updated_at).getTime()) / 60000;
    const within = (t: number) => nowMin >= t && nowMin < t + TICK_WINDOW;
    // D-12, §C-13.5c: solo gatea el AVISO — las transiciones de estado de abajo siguen igual.
    const quiet = isQuietHours(nowMin, profile.quietHoursStart, profile.quietHoursEnd);

    if (b.status === 'pending' && within(startMin) && canTransition('pending', 'awaiting_start_photo')) {
      await svc.from('blocks').update({ status: 'awaiting_start_photo' }).eq('id', b.id);
      const body = `${greeting}vamos a empezar con ${b.label}. Tienes ${PHOTO_WINDOW_MIN} minutos para mandarme la foto de que arrancaste.`;
      await notifyUnlessQuiet(b.user_id, quiet, { title: 'Empieza tu bloque', body, url: '/focus' }, body);
      actions++;
    } else if (
      b.status === 'awaiting_start_photo' &&
      ageMin >= PHOTO_WINDOW_MIN &&
      canTransition('awaiting_start_photo', 'skipped')
    ) {
      // D-10, §C-13.5: a diferencia de awaiting_photo (nunca se auto-marca, INV-11), aquí no
      // hubo trabajo que preservar — se venció la ventana fija de la foto de inicio.
      await svc.from('blocks').update({ status: 'skipped' }).eq('id', b.id);
      const body = `No llegó la foto de inicio a tiempo: ${b.label}. Lo salté.`;
      await notifyUnlessQuiet(b.user_id, quiet, { title: 'Bloque saltado', body, url: '/focus' }, body);
      actions++;
    } else if (b.status === 'active' && within(warnMin)) {
      await notifyUnlessQuiet(b.user_id, quiet, {
        title: 'Faltan ~10 min',
        body: `Prepara tu foto: ${b.label}`,
        url: '/focus',
      });
      actions++;
    } else if (b.status === 'active' && within(endMin) && canTransition('active', 'awaiting_photo')) {
      await svc.from('blocks').update({ status: 'awaiting_photo' }).eq('id', b.id);
      const body = `Tienes ${PHOTO_WINDOW_MIN} minutos para mandarme la foto de que terminaste: ${b.label}.`;
      await notifyUnlessQuiet(b.user_id, quiet, { title: 'Sube tu foto', body, url: '/focus' }, body);
      actions++;
    } else if (
      b.status === 'active' &&
      profile.frequentReminders &&
      frequentReminderDue(ageMin, endMin - nowMin)
    ) {
      // D-11: única fase nueva del recordatorio frecuente — hoy el único aviso durante `active`
      // era el de "faltan 10 min" (fijo, arriba); esto añade check-ins mientras trabaja.
      const remaining = Math.max(endMin - nowMin, 0);
      const body = `¿Sigues con ${b.label}? Quedan ${remaining} min.`;
      await notifyUnlessQuiet(b.user_id, quiet, { title: 'Recordatorio', body, url: '/focus' }, body);
      actions++;
    }
  }
  return actions;
}

async function runReminders(svc: FlowDayClient): Promise<number> {
  // awaiting_start_photo solo entra aquí para usuarios con recordatorio frecuente (D-11): por
  // defecto tiene una ventana fija de PHOTO_WINDOW_MIN y se salta automáticamente al vencer
  // (runSchedule) sin recordatorio intermedio — uno en ese mismo instante sería redundante con
  // el aviso de "bloque saltado".
  const now = new Date();
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, user_id, label, updated_at, status')
    .in('status', ['awaiting_photo', 'awaiting_start_photo']);
  const list = blocks ?? [];
  const profiles = await profileMap(svc, [...new Set(list.map((b) => b.user_id))]);
  let actions = 0;
  for (const b of list) {
    const ageMin = (now.getTime() - new Date(b.updated_at).getTime()) / 60000;
    const profile = profiles.get(b.user_id) ?? DEFAULT_PROFILE;
    const frequent = profile.frequentReminders;
    const quiet = isQuietHours(localMinutes(now, profile.timezone), profile.quietHoursStart, profile.quietHoursEnd);

    if (b.status === 'awaiting_start_photo') {
      if (frequent && frequentReminderDue(ageMin, PHOTO_WINDOW_MIN - ageMin)) {
        await notifyUnlessQuiet(
          b.user_id,
          quiet,
          { title: 'Foto de inicio pendiente', body: b.label, url: '/focus' },
          `¿Ya arrancaste con ${b.label}? Mándame la foto.`,
        );
        actions++;
      }
      continue;
    }

    // awaiting_photo: por defecto ≈3 recordatorios entre PHOTO_WINDOW_MIN y +17 min (§C-13.5),
    // cron cada 5 min. Con recordatorio frecuente, sin tope — sigue hasta que llegue la foto o
    // el usuario la salte (INV-11: nunca se auto-marca).
    const due = frequent
      ? ageMin >= PHOTO_WINDOW_MIN && frequentReminderDue(ageMin, null)
      : ageMin >= PHOTO_WINDOW_MIN && ageMin <= PHOTO_WINDOW_MIN + 17;
    if (due) {
      await notifyUnlessQuiet(
        b.user_id,
        quiet,
        { title: 'Foto pendiente', body: b.label, url: '/focus' },
        frequent ? `¿Ya terminaste con ${b.label}? Mándame la foto.` : undefined,
      );
      actions++;
    }
  }
  return actions;
}

async function runBriefing(svc: FlowDayClient): Promise<number> {
  const now = new Date();
  const { data: profiles } = await svc.from('profiles').select('id, timezone');
  let actions = 0;
  for (const p of profiles ?? []) {
    const nowMin = localMinutes(now, p.timezone);
    if (nowMin < BRIEFING_MIN || nowMin >= BRIEFING_MIN + TICK_WINDOW) continue; // ≈05:00 local

    const today = localDate(now, p.timezone);
    // §C-26.4/D-10: dispara la auto-organización del día (cacheada por hash, §C-26.3) — si el
    // usuario ya la disparó antes por WhatsApp ("comenzar"), esto es gratis (mismo hash).
    let blockCount = 0;
    try {
      const plan = await getOrComputeDailyPlan(p.id, today);
      blockCount = plan.length;
    } catch {
      const { data: blocks } = await svc.from('blocks').select('id').eq('user_id', p.id).eq('date', today);
      blockCount = blocks?.length ?? 0;
    }
    let body = `Tienes ${blockCount} bloque(s) hoy.`;
    try {
      const tasks = await listTasks(p.id);
      if (tasks.length > 0) body += ` ${tasks.length} tarea(s) en Google Tasks.`;
    } catch {
      // Google no conectado o error: briefing sin tareas.
    }
    await pushToUser(p.id, { title: 'Buenos días ☀️', body, url: '/dashboard' });
    actions++;
  }
  return actions;
}

// Corre una vez al día (n8n ~00:05 UTC). Para cada usuario con streak > 0, comprueba si
// tuvo ≥1 bloque verified "ayer" en su tz. Si no, reinicia el streak a 0 (§C-13.3).
async function runDailyReset(svc: FlowDayClient): Promise<number> {
  const now = new Date();
  const { data: profiles } = await svc.from('profiles').select('id, timezone, streak').gt('streak', 0);
  let actions = 0;
  for (const p of profiles ?? []) {
    const yesterday = localDate(addDays(now, -1), p.timezone);
    const { data: rows } = await svc
      .from('evidence')
      .select('created_at')
      .eq('user_id', p.id)
      .eq('verified', true)
      .eq('phase', 'end') // D-10: la foto de inicio no cuenta como "trabajo terminado" para el streak.
      .gte('created_at', addDays(now, -2).toISOString())
      .lte('created_at', now.toISOString());

    const hadVerifiedYesterday = (rows ?? []).some(
      (r) => localDate(new Date(r.created_at), p.timezone) === yesterday,
    );
    if (!hadVerifiedYesterday) {
      await svc.from('profiles').update({ streak: 0 }).eq('id', p.id);
      actions++;
    }
  }
  return actions;
}

// Drena verification_queue (§C-14.3): reprocesa las verificaciones encoladas cuando la visión
// estuvo agotada. Cuando vuelve la cuota, se verifican (y entonces se cobra, vía callAI). Es
// idempotente: si el bloque ya no espera foto (verificado por otra vía, saltado o borrado) la
// fila se cierra como 'done'. fromQueue=true evita re-encolar en un nuevo agotamiento.
async function runVerifyQueue(svc: FlowDayClient): Promise<number> {
  const { data: rows } = await svc
    .from('verification_queue')
    .select('id, user_id, block_id, photo_path, attempts, phase')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(QUEUE_BATCH);

  let verified = 0;
  for (const row of rows ?? []) {
    const { data: block } = await svc
      .from('blocks')
      .select('status, type, label')
      .eq('id', row.block_id)
      .maybeSingle();

    // D-10: la fase determina qué estado del bloque es válido para reprocesar.
    const phase = row.phase === 'start' ? 'start' : 'end';
    const requiredStatus = phase === 'start' ? 'awaiting_start_photo' : 'awaiting_photo';

    if (!block || block.status !== requiredStatus) {
      await svc
        .from('verification_queue')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    try {
      await verifyPhoto({
        userId: row.user_id,
        blockId: row.block_id,
        photoPath: row.photo_path,
        blockType: block.type,
        taskName: block.label,
        phase,
        fromQueue: true,
      });
      await svc
        .from('verification_queue')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      verified++;
    } catch (e) {
      // Visión aún agotada (u otro fallo): deja la fila para el próximo ciclo; tras
      // QUEUE_MAX_ATTEMPTS se marca 'failed' para no reintentar indefinidamente.
      const attempts = row.attempts + 1;
      await svc
        .from('verification_queue')
        .update({
          attempts,
          last_error: e instanceof AppError ? e.code : 'internal',
          status: attempts >= QUEUE_MAX_ATTEMPTS ? 'failed' : 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
  }
  return verified;
}
