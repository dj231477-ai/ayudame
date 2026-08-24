import { z } from 'zod';
import type { FlowDayClient } from '@flowday/core/auth';
import { AppError } from '@flowday/core/errors';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { authorizeInternal } from '@/lib/internal-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { canTransition } from '@/lib/blocks/state-machine';
import { pushToUser } from '@/lib/push/send';
import { listTasks } from '@/lib/google/tasks';
import { verifyPhoto } from '@/lib/verify-photo';
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

async function tzMap(svc: FlowDayClient, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data } = await svc.from('profiles').select('id, timezone').in('id', userIds);
  for (const p of data ?? []) map.set(p.id, p.timezone);
  return map;
}

async function runSchedule(svc: FlowDayClient): Promise<number> {
  const now = new Date();
  // Ventana de fechas UTC que cubre cualquier tz.
  const dates = [localDate(addDays(now, -1), 'UTC'), localDate(now, 'UTC'), localDate(addDays(now, 1), 'UTC')];
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, user_id, start_time, end_time, label, status, date')
    .in('status', ['pending', 'active'])
    .in('date', dates);

  const list = blocks ?? [];
  const tz = await tzMap(svc, [...new Set(list.map((b) => b.user_id))]);
  let actions = 0;

  for (const b of list) {
    const zone = tz.get(b.user_id) ?? 'America/Bogota';
    if (b.date !== localDate(now, zone)) continue; // solo "hoy" en la tz del usuario (INV-12)

    const nowMin = localMinutes(now, zone);
    const startMin = timeToMinutes(b.start_time);
    const endMin = timeToMinutes(b.end_time);
    const warnMin = endMin - WARNING_BEFORE_END;
    const within = (t: number) => nowMin >= t && nowMin < t + TICK_WINDOW;

    if (b.status === 'pending' && within(startMin) && canTransition('pending', 'active')) {
      await svc.from('blocks').update({ status: 'active' }).eq('id', b.id);
      await pushToUser(b.user_id, { title: 'Bloque iniciado', body: b.label, url: '/focus' });
      actions++;
    } else if (b.status === 'active' && within(warnMin)) {
      await pushToUser(b.user_id, { title: 'Faltan ~10 min', body: `Prepara tu foto: ${b.label}`, url: '/focus' });
      actions++;
    } else if (b.status === 'active' && within(endMin) && canTransition('active', 'awaiting_photo')) {
      await svc.from('blocks').update({ status: 'awaiting_photo' }).eq('id', b.id);
      await pushToUser(b.user_id, { title: 'Sube tu foto', body: b.label, url: '/focus' });
      actions++;
    }
  }
  return actions;
}

async function runReminders(svc: FlowDayClient): Promise<number> {
  const now = Date.now();
  const { data: blocks } = await svc
    .from('blocks')
    .select('id, user_id, label, updated_at, status')
    .eq('status', 'awaiting_photo');
  let actions = 0;
  for (const b of blocks ?? []) {
    const ageMin = (now - new Date(b.updated_at).getTime()) / 60000;
    // ≈3 recordatorios entre los 15 y 30 min (§C-13.5), cron cada 5 min.
    if (ageMin >= 15 && ageMin <= 32) {
      await pushToUser(b.user_id, { title: 'Foto pendiente', body: b.label, url: '/focus' });
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
    const { data: blocks } = await svc.from('blocks').select('id').eq('user_id', p.id).eq('date', today);
    let body = `Tienes ${blocks?.length ?? 0} bloque(s) hoy.`;
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
    .select('id, user_id, block_id, photo_path, attempts')
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

    if (!block || block.status !== 'awaiting_photo') {
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
