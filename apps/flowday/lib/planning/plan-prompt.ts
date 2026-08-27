import { dropOverlapping } from './gaps';

// Funciones puras de planificación (sin 'server-only'): testeables en aislamiento.
// SPEC §C-26.1: la IA es el último recurso, solo para encajar tareas SIN hora en los huecos
// libres que dejan los bloques fijos (eventos con hora exacta, que se resuelven sin IA en
// daily-plan.ts). Los títulos de tareas van como `userData` (nunca interpolados, §C-10.5).

export interface FixedBlockInput {
  label: string;
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
}

export interface UnscheduledTaskInput {
  id: string;
  title: string;
}

const DAY_START = '07:00';
const DAY_END = '21:00';

/** D-14, §C-26.2b: ¿queda margen hoy para encajar algo con IA a partir de "ahora"? */
export function hasRoomToday(nowHHMM: string): boolean {
  return nowHHMM < DAY_END;
}

/** D-14, §C-26.2b: piso real del día — "ahora" si ya pasó DAY_START, si no DAY_START. */
function effectiveStart(nowHHMM: string): string {
  return nowHHMM > DAY_START ? nowHHMM : DAY_START;
}

/** PLAN_PROMPT (§C-26.2/§C-26.3/§C-26.2b): encaja tareas sin hora en los huecos libres del día,
 *  nunca antes de `nowHHMM` (D-14: si se calcula a media jornada, no propone nada en el pasado). */
export function buildPlanPrompt(fixedBlocks: FixedBlockInput[], nowHHMM: string): string {
  const start = effectiveStart(nowHHMM);
  const fixedDesc =
    fixedBlocks.length === 0
      ? 'Ninguno.'
      : fixedBlocks.map((b) => `${b.start_time}-${b.end_time}: ${b.label}`).join('; ');
  return `Eres el planificador diario de FlowDay. Ahora mismo son las ${nowHHMM}. El día disponible va de ${start} a ${DAY_END} — NUNCA asignes nada antes de ${start}, ya pasó y sería incoherente.
Bloques ya fijos hoy (no los toques, no te superpongas con ellos): ${fixedDesc}
Encaja cada tarea listada en <user_data> en un hueco libre del día, en el orden que tenga más sentido.
Cada bloque dura entre 25 y 90 minutos según la tarea. No superpongas bloques entre sí ni con los fijos.
Si una tarea no cabe en ningún hueco libre, omítela.
Responde SOLO con JSON: {"blocks": [{"task_id": string, "label": string<=100, "start_time": "HH:MM", "end_time": "HH:MM", "type": "deep"|"admin"|"body"|"rest"|"review"}]}.
"type" por defecto "deep" salvo que el título de la tarea sugiera claramente otro (ejercicio→"body", descanso→"rest", revisión/lectura→"review", administrativo→"admin").`;
}

export interface PlannedBlock {
  task_id: string;
  label: string;
  start_time: string;
  end_time: string;
  type: 'deep' | 'admin' | 'body' | 'rest' | 'review';
}

const VALID_TYPES = new Set(['deep', 'admin', 'body', 'rest', 'review']);
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Parseo tolerante del JSON del modelo (acepta fences ```json), descarta filas inválidas.
 * `earliestStart` (D-14, defensa en profundidad): descarta también bloques que el modelo haya
 * propuesto antes de esa hora, en caso de que no haya seguido la instrucción del prompt.
 * `fixedBlocks` (§C-26.2, defensa en profundidad): si se pasa, descarta además los bloques que
 * se solapen con los fijos o entre sí. El prompt ya lo pide, pero `computePlan` materializa
 * esta salida en `blocks`, así que un solape aceptado pisaría una reunión real del usuario.
 */
export function parsePlanResponse(
  text: string,
  earliestStart?: string,
  fixedBlocks?: FixedBlockInput[],
): PlannedBlock[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as { blocks?: unknown };
    if (!Array.isArray(obj.blocks)) return [];
    const wellFormed = obj.blocks.filter((b): b is PlannedBlock => {
      if (typeof b !== 'object' || b === null) return false;
      const r = b as Record<string, unknown>;
      const valid =
        typeof r.task_id === 'string' &&
        typeof r.label === 'string' &&
        typeof r.start_time === 'string' &&
        TIME_RE.test(r.start_time) &&
        typeof r.end_time === 'string' &&
        TIME_RE.test(r.end_time) &&
        typeof r.type === 'string' &&
        VALID_TYPES.has(r.type);
      if (!valid) return false;
      if (earliestStart && (r.start_time as string) < earliestStart) return false;
      return true;
    });
    return fixedBlocks ? dropOverlapping(wellFormed, fixedBlocks) : wellFormed;
  } catch {
    return [];
  }
}
