// Funciones puras de geometría del día (sin 'server-only'): testeables en aislamiento.
// SPEC §C-26.1/§C-26.2: los bloques fijos (eventos con hora exacta) se resuelven sin IA; lo que
// la IA propone debe caber en los huecos que esos fijos dejan libres.
//
// El prompt (buildPlanPrompt) ya le pide al modelo que no se superponga, pero una instrucción en
// lenguaje natural no es una garantía: `computePlan` materializa el resultado en `blocks`, así
// que un solape aceptado se convierte en una fila real que pisa una reunión del usuario. Esto es
// la comprobación mecánica que respalda la instrucción.

/** Ventana de trabajo. NO normativa (§C-26 no fija horario); debe coincidir con plan-prompt.ts. */
export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 21 * 60; // 21:00
/** Huecos más cortos que esto no sirven para nada: se descartan. */
export const MIN_GAP_MIN = 10;

export interface Interval {
  start: number; // minutos desde medianoche
  end: number;
}

export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function minToTime(min: number): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

/**
 * Huecos libres de la jornada tras restar los intervalos ocupados [§C-26.2].
 * Tolera entradas desordenadas y solapadas entre sí, y recorta a la ventana de trabajo.
 */
export function freeGaps(busy: Interval[]): Interval[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let cursor = DAY_START_MIN;
  for (const b of sorted) {
    const start = Math.max(b.start, DAY_START_MIN);
    const end = Math.min(b.end, DAY_END_MIN);
    if (start > cursor) gaps.push({ start: cursor, end: Math.min(start, DAY_END_MIN) });
    cursor = Math.max(cursor, end);
  }
  if (cursor < DAY_END_MIN) gaps.push({ start: cursor, end: DAY_END_MIN });
  return gaps.filter((g) => g.end - g.start >= MIN_GAP_MIN);
}

/** ¿El intervalo cabe ENTERO dentro de alguno de los huecos? (tocar los bordes vale). */
export function fitsInSomeGap(block: Interval, gaps: Interval[]): boolean {
  return gaps.some((g) => block.start >= g.start && block.end <= g.end);
}

export interface TimedBlock {
  start_time: string; // 'HH:MM'
  end_time: string;
}

/**
 * Descarta los bloques propuestos que no caben en los huecos que dejan los fijos, o que se pisan
 * entre sí. Los aceptados se van añadiendo a los ocupados, así que el orden importa: se procesan
 * por hora de inicio y, ante un choque, gana el que empieza antes.
 *
 * Devuelve los bloques conservados en el orden en que llegaron (no reordena la salida), para no
 * alterar el criterio de la IA más allá de lo necesario.
 */
export function dropOverlapping<T extends TimedBlock>(blocks: T[], fixed: TimedBlock[]): T[] {
  const busy: Interval[] = fixed.map((f) => ({ start: timeToMin(f.start_time), end: timeToMin(f.end_time) }));
  const kept = new Set<T>();

  const byStart = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time));
  for (const b of byStart) {
    const iv = { start: timeToMin(b.start_time), end: timeToMin(b.end_time) };
    if (iv.end <= iv.start) continue; // duración nula o invertida
    if (!fitsInSomeGap(iv, freeGaps(busy))) continue;
    kept.add(b);
    busy.push(iv); // el aceptado pasa a ocupar, para que el siguiente no lo pise
  }

  return blocks.filter((b) => kept.has(b));
}
