// Funciones puras de cadencia de recordatorios (sin 'server-only'): testeables en aislamiento.
// SPEC §C-13.5, D-11: modo "recordatorio frecuente" opt-in (profiles.frequent_reminders,
// default false) — pensado para TDAH/memoria débil. Escalona: espaciado lejos del límite,
// en cada tick cerca de él. El piso de resolución es TICK_WINDOW_MIN porque los crons de n8n
// corren cada 5 min (§C-12.2) — no hay forma de recordar más seguido sin acortar esos crons.

export const TICK_WINDOW_MIN = 5; // debe coincidir con el cron real (cada 5 min)
export const FREQUENT_ESCALATE_THRESHOLD_MIN = 15; // por debajo de esto, cada tick (D-11)
export const FREQUENT_SPACED_INTERVAL_MIN = 10; // por encima del umbral, cada 10 min

/** ¿Este tick (de ancho TICK_WINDOW_MIN) cae en un múltiplo de intervalMin desde que empezó? */
export function dueOnTick(elapsedMin: number, intervalMin: number): boolean {
  const mod = ((elapsedMin % intervalMin) + intervalMin) % intervalMin;
  return mod < TICK_WINDOW_MIN;
}

/**
 * D-11: ¿toca un recordatorio frecuente en este tick? `remainingMin` son los minutos hasta el
 * límite relevante (deadline dura como awaiting_start_photo, o blanda como el fin de un bloque
 * activo); `null` cuando no hay límite (awaiting_photo, INV-11: nunca se auto-marca, así que el
 * recordatorio frecuente se mantiene indefinidamente hasta que llegue la foto).
 */
export function frequentReminderDue(elapsedMin: number, remainingMin: number | null): boolean {
  if (elapsedMin < TICK_WINDOW_MIN) return false; // no duplicar el aviso de la transición misma.
  const urgent =
    remainingMin === null
      ? elapsedMin >= FREQUENT_ESCALATE_THRESHOLD_MIN
      : remainingMin <= FREQUENT_ESCALATE_THRESHOLD_MIN;
  return dueOnTick(elapsedMin, urgent ? TICK_WINDOW_MIN : FREQUENT_SPACED_INTERVAL_MIN);
}
