// Función pura de horario de silencio (sin 'server-only'): testeable en aislamiento.
// SPEC §C-13.5c, D-12: personalizable por usuario (profiles.quiet_hours_start/end, ambos
// nulos por defecto = deshabilitado). Solo gatea el ENVÍO proactivo del scheduler — nunca las
// transiciones de estado ni las respuestas directas a un mensaje entrante.

import { timeToMinutes } from '../datetime';

/**
 * ¿Cae `nowMin` (minutos desde medianoche, tz local del usuario) dentro del horario de
 * silencio [start, end)? Soporta rangos que cruzan medianoche (start > end, p. ej. 22:00–07:00).
 * `null` en cualquiera de los dos ⇒ deshabilitado. Un rango vacío (start === end) también
 * se trata como deshabilitado en vez de "silencio 24h", que sería una trampa de configuración.
 */
export function isQuietHours(nowMin: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  if (s < e) return nowMin >= s && nowMin < e;
  return nowMin >= s || nowMin < e; // cruza medianoche
}
