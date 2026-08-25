import 'server-only';
import { createHash } from 'node:crypto';
import { callAI } from '@flowday/core/ai/router';
import { logger } from '@flowday/core/observability/logger';
import type { BlockType, Json } from '@flowday/core/supabase/types';
import { createServiceClient } from '@/lib/supabase/service';
import { localDayRangeUtc, localTimeHHMM } from '@/lib/datetime';
import { listUpcomingEvents } from '@/lib/google/calendar';
import { listTasks, scheduleTask } from '@/lib/google/tasks';
import { buildPlanPrompt, parsePlanResponse, hasRoomToday, type FixedBlockInput } from './plan-prompt';

// =============================================================================
// Auto-organización de Calendar/Tasks  [NORMATIVO — SPEC §C-26, D-10]
// Principios (§C-26.1): la IA es último recurso; eventos con hora exacta se convierten
// en bloques directos sin IA (§C-26.2); una llamada de IA por día por usuario, cacheada
// por hash (§C-26.3); disparada por morning-briefing o, bajo demanda (D-10), por la
// palabra clave de arranque de WhatsApp (§C-13.10) — el hash hace que la segunda
// invocación del día, venga de donde venga, sea gratis.
// =============================================================================

export interface DailyPlanBlock {
  label: string;
  start_time: string;
  end_time: string;
  type: BlockType;
  task_id?: string;
}

/**
 * canonical() del hash (§C-26.3): `sha256(canonical(tasks) + canonical(events) + date + tz)`.
 * Deliberadamente NO incluye los bloques ya materializados en `blocks`: si los incluyera, la
 * propia escritura de esta función invalidaría su cache en la siguiente corrida del mismo día
 * (el plan crea bloques ⇒ existingBlocks cambia ⇒ hash distinto ⇒ IA se llamaría de nuevo),
 * violando "una llamada de IA por día" (§C-26.1).
 */
function computeSourceHash(input: {
  dateStr: string;
  tz: string;
  events: { id: string; summary: string; start: string | null; end: string | null }[];
  tasks: { id: string; title: string; status: string; due?: string }[];
}): string {
  const canon = {
    date: input.dateStr,
    tz: input.tz,
    events: [...input.events]
      .map((e) => ({ id: e.id, s: e.summary, start: e.start, end: e.end }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    tasks: [...input.tasks]
      .map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.due ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/**
 * Obtiene (de cache) o calcula el plan del día y crea en `blocks` los que aún no existan.
 * Idempotente: llamarla varias veces el mismo día con las mismas fuentes no gasta IA de nuevo
 * (§C-26.3) ni duplica bloques (se compara contra los ya existentes por `label`, D-16).
 */
export async function getOrComputeDailyPlan(userId: string, dateStr: string): Promise<DailyPlanBlock[]> {
  const svc = createServiceClient();

  const { data: profile } = await svc.from('profiles').select('timezone').eq('id', userId).single();
  const tz = profile?.timezone ?? 'America/Bogota';
  const { start, end } = localDayRangeUtc(dateStr, tz);

  let events: Awaited<ReturnType<typeof listUpcomingEvents>> = [];
  try {
    events = await listUpcomingEvents(userId, { timeMin: start, timeMax: end });
  } catch {
    // Google Calendar no conectado o error transitorio: se planifica sin eventos.
  }

  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  try {
    tasks = await listTasks(userId);
  } catch {
    // Google Tasks no conectado o error transitorio: se planifica sin tareas.
  }

  const { data: existing } = await svc
    .from('blocks')
    .select('label, start_time, end_time, type, task_id')
    .eq('user_id', userId)
    .eq('date', dateStr);
  const existingBlocks = existing ?? [];

  const sourceHash = computeSourceHash({ dateStr, tz, events, tasks });

  const { data: cached } = await svc
    .from('reorg_cache')
    .select('source_hash, plan')
    .eq('user_id', userId)
    .eq('date', dateStr)
    .maybeSingle();

  let plan: DailyPlanBlock[];
  if (cached && cached.source_hash === sourceHash) {
    plan = cached.plan as unknown as DailyPlanBlock[];
  } else {
    plan = await computePlan(userId, dateStr, tz, events, tasks);
    await svc.from('reorg_cache').upsert({
      user_id: userId,
      date: dateStr,
      source_hash: sourceHash,
      plan: plan as unknown as Json,
      computed_at: new Date().toISOString(),
    });
  }

  // Materializa en `blocks` los que aún no existan hoy (match por `label` — derivado, no hay
  // unicidad estricta. D-16: el match NO puede incluir start_time — computeCatchUp (D-15) muta
  // el start_time del bloque ya insertado, así que comparar contra el start_time original del
  // plan cacheado siempre fallaba y volvía a insertar un duplicado en cada llamada posterior).
  const existingKeys = new Set(existingBlocks.map((b) => b.label));
  const toInsert = plan
    .filter((p) => !existingKeys.has(p.label))
    .map((p) => ({
      user_id: userId,
      date: dateStr,
      start_time: p.start_time,
      end_time: p.end_time,
      label: p.label,
      type: p.type,
      task_id: p.task_id ?? null,
    }));
  if (toInsert.length > 0) {
    await svc.from('blocks').insert(toInsert);
    logger.info({ event: 'daily_plan.blocks_created', user_id: userId, count: toInsert.length });
  }

  return plan;
}

/** §C-26.2: eventos con hora exacta → bloques directos, sin IA. §C-26.1: IA solo para el resto. */
async function computePlan(
  userId: string,
  dateStr: string,
  tz: string,
  events: Awaited<ReturnType<typeof listUpcomingEvents>>,
  tasks: Awaited<ReturnType<typeof listTasks>>,
): Promise<DailyPlanBlock[]> {
  const fixed: DailyPlanBlock[] = [];
  for (const e of events) {
    if (!e.start || !e.end || !e.start.includes('T') || !e.end.includes('T')) continue; // all-day: sin hora exacta.
    fixed.push({
      label: e.summary,
      start_time: localTimeHHMM(new Date(e.start), tz),
      end_time: localTimeHHMM(new Date(e.end), tz),
      type: 'admin',
    });
  }

  // D-23, §C-26.2c: solo se ofrecen a la IA las tareas vencidas hoy o antes — no todo el
  // backlog de todas las listas (un usuario real puede tener decenas sin relación con hoy).
  // `due` de Google Tasks solo trae fecha (siempre medianoche UTC, confirmado D-24): comparar
  // el prefijo de fecha evita cualquier desfase de zona horaria al convertir con `Date`.
  const pendingTasks = tasks.filter(
    (t) => t.status !== 'completed' && !!t.due && t.due.slice(0, 10) <= dateStr,
  );
  const nowHHMM = localTimeHHMM(new Date(), tz);
  if (pendingTasks.length === 0 || !hasRoomToday(nowHHMM)) {
    // Nada que encajar con IA (sin tareas, o ya no queda margen hoy — D-14, §C-26.2b):
    // se sirve solo de lo determinista (§C-26.1 principio 1).
    return fixed.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  const fixedInput: FixedBlockInput[] = fixed.map((f) => ({
    label: f.label,
    start_time: f.start_time,
    end_time: f.end_time,
  }));

  try {
    const ai = await callAI(userId, 'daily_briefing', {
      modality: 'text',
      system: buildPlanPrompt(fixedInput, nowHHMM),
      userData: JSON.stringify(pendingTasks.map((t) => ({ id: t.id, title: t.title }))),
    });
    const planned = parsePlanResponse(ai.text, nowHHMM);
    const aiBlocks: DailyPlanBlock[] = planned.map((p) => ({
      label: p.label,
      start_time: p.start_time,
      end_time: p.end_time,
      type: p.type,
      task_id: p.task_id,
    }));
    await scheduleTasksToday(userId, dateStr, aiBlocks);
    return [...fixed, ...aiBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time));
  } catch {
    // Degradación explícita (§C-14.3): sin IA disponible, se sirve solo lo determinista.
    logger.warn({ event: 'daily_plan.ai_unavailable', user_id: userId, error: { code: 'internal' } });
    return fixed.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
}

/**
 * D-24, §C-26.7: al encajar una tarea en el día de hoy, se escribe `due=hoy` en Google Tasks
 * (solo fecha — la API descarta la hora, §C-13.10/§C-26.7). Best-effort: un fallo aquí nunca
 * bloquea la planificación, solo se registra (mismo patrón que completeTask en verifyPhoto).
 */
async function scheduleTasksToday(userId: string, dateStr: string, aiBlocks: DailyPlanBlock[]): Promise<void> {
  await Promise.all(
    aiBlocks
      .filter((b): b is DailyPlanBlock & { task_id: string } => !!b.task_id)
      .map(async (b) => {
        try {
          const ok = await scheduleTask(userId, b.task_id, dateStr);
          if (!ok) logger.warn({ event: 'daily_plan.schedule_task_failed', user_id: userId, task_id: b.task_id });
        } catch {
          logger.warn({ event: 'daily_plan.schedule_task_failed', user_id: userId, task_id: b.task_id });
        }
      }),
  );
}
