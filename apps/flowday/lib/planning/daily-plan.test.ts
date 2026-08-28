import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../../tests/helpers/supabase-mock';
import { server } from '../../tests/msw/server';
import {
  googleCalendarEvents,
  googleCalendarCreate,
  googleTaskLists,
  googleTaskPatch,
} from '../../tests/msw/google';

// =============================================================================
// SPEC §C-26, D-10: orquestación del plan diario.
//
// Este es el módulo donde ocurrieron D-15 y D-16 (duplicados por deduplicar con `start_time`,
// que el catch-up muta) y donde D-22 degradaba en silencio. Hasta ahora no tenía ningún test:
// solo lo tenían sus helpers puros (plan-prompt, gaps).
//
// Google va por MSW (§C-18.4) atravesando de verdad lib/google/*; se mockean únicamente el
// token de OAuth, el cliente de Supabase y callAI.
// =============================================================================

let mockClient: MockClient;
const callAI = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve(undefined));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));
vi.mock('@/lib/google/tokens', () => ({ getValidAccessToken: () => Promise.resolve('token') }));
vi.mock('@flowday/core/ai/router', () => ({
  callAI: (userId: string, action: string, req: unknown) => callAI(userId, action, req),
}));

import { getOrComputeDailyPlan } from './daily-plan';

const UID = 'u1';
const DATE = '2026-06-22';
const TZ = 'America/Bogota';

/** Orden real de lectura: profiles → blocks (existentes) → reorg_cache. */
function ctx(opts: {
  profile?: Record<string, unknown>;
  existingBlocks?: unknown[];
  cached?: { source_hash: string; plan: unknown } | null;
} = {}) {
  return createMockClient({
    tableResults: {
      profiles: { data: opts.profile ?? { timezone: TZ, max_daily_tasks: 5, auto_organize_tasks: false } },
      blocks: { data: opts.existingBlocks ?? [] },
      reorg_cache: { data: opts.cached ?? null },
    },
  });
}

/** Respuesta de la IA con los bloques indicados. */
function aiPlan(blocks: Array<Record<string, unknown>>) {
  return { text: JSON.stringify({ blocks }), provider: 'groq', usageLogId: 'ul1' };
}

const REUNION = {
  id: 'e1',
  summary: 'Reunión de equipo',
  start: { dateTime: `${DATE}T15:00:00.000Z` }, // 10:00 en America/Bogota (UTC-5)
  end: { dateTime: `${DATE}T16:00:00.000Z` },
};

beforeEach(() => {
  callAI.mockReset();
  mockClient = ctx();
  // El reloj SE CONGELA a propósito: `computePlan` usa la hora actual como piso (D-14,
  // `earliestStart`), así que sin fijarlo estos tests pasarían o fallarían según la hora del día.
  // 12:00 UTC = 07:00 en Bogotá, con la jornada entera por delante.
  vi.setSystemTime(new Date(`${DATE}T12:00:00.000Z`));
});
afterEach(() => vi.useRealTimers());

describe('getOrComputeDailyPlan — camino determinista (§C-26.1/§C-26.2)', () => {
  it('un evento con hora exacta se convierte en bloque SIN llamar a la IA', async () => {
    server.use(googleCalendarEvents([REUNION]), ...googleTaskLists([]));

    const plan = await getOrComputeDailyPlan(UID, DATE);

    expect(callAI).not.toHaveBeenCalled();
    expect(plan).toEqual([
      { label: 'Reunión de equipo', start_time: '10:00', end_time: '11:00', type: 'admin' },
    ]);
  });

  it('sin tareas pendientes no gasta IA aunque haya huecos', async () => {
    server.use(googleCalendarEvents([]), ...googleTaskLists([]));
    await getOrComputeDailyPlan(UID, DATE);
    expect(callAI).not.toHaveBeenCalled();
  });

  it('los eventos de todo el día no generan bloque (no tienen hora)', async () => {
    server.use(
      googleCalendarEvents([{ id: 'e9', summary: 'Feriado', start: { date: DATE }, end: { date: '2026-06-23' } }]),
      ...googleTaskLists([]),
    );
    expect(await getOrComputeDailyPlan(UID, DATE)).toEqual([]);
  });
});

describe('getOrComputeDailyPlan — cache por hash (§C-26.3)', () => {
  it('con hash coincidente sirve de cache y NO llama a la IA', async () => {
    server.use(googleCalendarEvents([]), ...googleTaskLists([]));
    // Primera pasada: calcula y guarda el hash real que produce este conjunto de fuentes.
    await getOrComputeDailyPlan(UID, DATE);
    const upsert = mockClient.log.find((l) => l.op === 'upsert' && l.table === 'reorg_cache');
    const hash = (upsert?.payload as { source_hash: string }).source_hash;

    // Segunda pasada con ese hash ya en cache: ni IA ni reescritura de la cache.
    const cachedPlan = [{ label: 'Desde cache', start_time: '09:00', end_time: '10:00', type: 'deep' }];
    mockClient = ctx({ cached: { source_hash: hash, plan: cachedPlan } });
    callAI.mockReset();

    expect(await getOrComputeDailyPlan(UID, DATE)).toEqual(cachedPlan);
    expect(callAI).not.toHaveBeenCalled();
    expect(mockClient.log.find((l) => l.op === 'upsert' && l.table === 'reorg_cache')).toBeUndefined();
  });

  it('con hash distinto recalcula y reescribe la cache', async () => {
    server.use(googleCalendarEvents([REUNION]), ...googleTaskLists([]));
    mockClient = ctx({ cached: { source_hash: 'hash-viejo', plan: [] } });

    const plan = await getOrComputeDailyPlan(UID, DATE);
    expect(plan).toHaveLength(1);
    expect(mockClient.log.find((l) => l.op === 'upsert' && l.table === 'reorg_cache')).toBeDefined();
  });

  it('el tope de tareas (D-25) entra en el hash: cambiarlo invalida la cache', async () => {
    server.use(googleCalendarEvents([]), ...googleTaskLists([]));
    await getOrComputeDailyPlan(UID, DATE);
    const hash5 = (mockClient.log.find((l) => l.op === 'upsert')?.payload as { source_hash: string }).source_hash;

    mockClient = ctx({ profile: { timezone: TZ, max_daily_tasks: 3, auto_organize_tasks: false } });
    await getOrComputeDailyPlan(UID, DATE);
    const hash3 = (mockClient.log.find((l) => l.op === 'upsert')?.payload as { source_hash: string }).source_hash;

    expect(hash3).not.toBe(hash5);
  });
});

describe('getOrComputeDailyPlan — materialización en blocks (D-16)', () => {
  it('inserta los bloques del plan que aún no existen', async () => {
    server.use(googleCalendarEvents([REUNION]), ...googleTaskLists([]));

    await getOrComputeDailyPlan(UID, DATE);
    const ins = mockClient.log.find((l) => l.op === 'insert' && l.table === 'blocks');
    expect(ins).toBeDefined();
    expect((ins?.payload as unknown[]).length).toBe(1);
  });

  it('D-16: deduplica por `label`, aunque el start_time haya cambiado por el catch-up', async () => {
    server.use(googleCalendarEvents([REUNION]), ...googleTaskLists([]));
    // El bloque ya existe pero con OTRA hora — justo lo que hace computeCatchUp (D-15).
    // Deduplicar por start_time+label habría insertado un duplicado en cada llamada.
    mockClient = ctx({ existingBlocks: [{ label: 'Reunión de equipo', start_time: '18:30', end_time: '19:30' }] });

    await getOrComputeDailyPlan(UID, DATE);
    expect(mockClient.log.find((l) => l.op === 'insert' && l.table === 'blocks')).toBeUndefined();
  });
});

describe('getOrComputeDailyPlan — encaje con IA (§C-26.1)', () => {
  const TAREAS = googleTaskLists([
    { id: 'l1', title: 'Mis tareas', tasks: [{ id: 't1', title: 'Escribir el informe', due: `${DATE}T00:00:00.000Z` }] },
  ]);

  it('con tareas vencidas llama a la IA y materializa lo que devuelve', async () => {
    server.use(googleCalendarEvents([]), ...TAREAS, googleTaskPatch());
    callAI.mockResolvedValue(
      aiPlan([{ task_id: 'l1:t1', label: 'Escribir el informe', start_time: '09:00', end_time: '10:00', type: 'deep' }]),
    );

    const plan = await getOrComputeDailyPlan(UID, DATE);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(plan).toEqual([
      { label: 'Escribir el informe', start_time: '09:00', end_time: '10:00', type: 'deep', task_id: 'l1:t1' },
    ]);
  });

  it('§C-26.2: descarta el bloque que la IA proponga encima de una reunión real', async () => {
    server.use(googleCalendarEvents([REUNION]), ...TAREAS, googleTaskPatch());
    // 10:30-11:30 pisa la reunión de 10:00-11:00.
    callAI.mockResolvedValue(
      aiPlan([{ task_id: 'l1:t1', label: 'Pisa la reunión', start_time: '10:30', end_time: '11:30', type: 'deep' }]),
    );

    const plan = await getOrComputeDailyPlan(UID, DATE);
    expect(plan.map((b) => b.label)).toEqual(['Reunión de equipo']);
  });

  it('D-24: escribe `due=hoy` en Google Tasks para la tarea encajada', async () => {
    const patches: Array<{ body: unknown; taskId: string }> = [];
    server.use(googleCalendarEvents([]), ...TAREAS, googleTaskPatch((body, _l, taskId) => patches.push({ body, taskId })));
    callAI.mockResolvedValue(
      aiPlan([{ task_id: 'l1:t1', label: 'Escribir el informe', start_time: '09:00', end_time: '10:00', type: 'deep' }]),
    );

    await getOrComputeDailyPlan(UID, DATE);
    expect(patches).toEqual([{ body: { due: `${DATE}T00:00:00.000Z` }, taskId: 't1' }]);
  });

  it('degradación explícita (§C-14.3): si la IA falla, se sirve solo lo determinista', async () => {
    server.use(googleCalendarEvents([REUNION]), ...TAREAS);
    callAI.mockRejectedValue(new Error('ai_text_exhausted'));

    const plan = await getOrComputeDailyPlan(UID, DATE);
    expect(plan.map((b) => b.label)).toEqual(['Reunión de equipo']);
  });

  it('D-23: una tarea que vence mañana no se ofrece a la IA', async () => {
    server.use(
      googleCalendarEvents([]),
      ...googleTaskLists([{ id: 'l1', title: 'X', tasks: [{ id: 't9', title: 'Futura', due: '2026-06-30T00:00:00.000Z' }] }]),
    );
    await getOrComputeDailyPlan(UID, DATE);
    expect(callAI).not.toHaveBeenCalled();
  });

  it('D-26: una tarea SIN fecha solo entra si auto_organize_tasks está activo', async () => {
    const sinFecha = googleTaskLists([{ id: 'l1', title: 'X', tasks: [{ id: 't5', title: 'Backlog' }] }]);

    server.use(googleCalendarEvents([]), ...sinFecha);
    await getOrComputeDailyPlan(UID, DATE);
    expect(callAI).not.toHaveBeenCalled();

    mockClient = ctx({ profile: { timezone: TZ, max_daily_tasks: 5, auto_organize_tasks: true } });
    server.use(googleCalendarEvents([]), ...sinFecha, googleTaskPatch(), googleCalendarCreate('evt-9'));
    callAI.mockResolvedValue(
      aiPlan([{ task_id: 'l1:t5', label: 'Backlog', start_time: '09:00', end_time: '10:00', type: 'deep' }]),
    );

    const plan = await getOrComputeDailyPlan(UID, DATE);
    expect(callAI).toHaveBeenCalledTimes(1);
    // D-26/§C-26.7c: con el interruptor activo se crea el evento real y se guarda su id.
    expect(plan[0]).toMatchObject({ label: 'Backlog', calendar_event_id: 'evt-9' });
  });
});

describe('getOrComputeDailyPlan — degradación de Google (D-22)', () => {
  it('si Calendar y Tasks fallan, el plan queda vacío sin lanzar', async () => {
    server.use(
      googleCalendarEvents([], () => {
        throw new Error('boom');
      }),
      ...googleTaskLists([]),
    );
    await expect(getOrComputeDailyPlan(UID, DATE)).resolves.toEqual([]);
  });
});
