// Función pura de reagenda ("catch-up") para bloques abandonados — sin 'server-only',
// testeable en aislamiento. SPEC §C-13.3b, D-15: un bloque `pending` cuya ventana original ya
// pasó por completo sin arrancar se reagenda para empezar "ahora" en vez de mostrarse con una
// hora incoherente ("son las 2pm y me asigna algo de las 10am") — el usuario aprobó
// explícitamente modificar el horario original para esto.

import { timeToMinutes, minutesToHHMM } from '../datetime';

const MIN_DURATION_MIN = 15; // piso razonable si el bloque original era muy corto

/**
 * Si `endTime` ya pasó respecto a `nowMin`, devuelve el nuevo `{start_time, end_time}`
 * (empezando ahora, misma duración original). Si todavía no pasó, devuelve `null` — nada que
 * reagendar.
 */
export function computeCatchUp(
  nowMin: number,
  startTime: string,
  endTime: string,
): { start_time: string; end_time: string } | null {
  const endMin = timeToMinutes(endTime);
  if (endMin > nowMin) return null;
  const durationMin = Math.max(timeToMinutes(endTime) - timeToMinutes(startTime), MIN_DURATION_MIN);
  return {
    start_time: minutesToHHMM(nowMin),
    end_time: minutesToHHMM(nowMin + durationMin),
  };
}
