// Utilidades de fecha en zona horaria del usuario (INV-12, §C-12.5).

/** Fecha local 'YYYY-MM-DD' para una tz (autoridad de agenda = tz del usuario). */
export function localDate(date: Date, timeZone: string): string {
  // en-CA produce formato ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Suma (o resta) días a una fecha y devuelve un nuevo Date. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Minutos desde medianoche en la tz dada (INV-12). 0..1439. */
export function localMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Convierte 'HH:MM' o 'HH:MM:SS' a minutos desde medianoche. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}
