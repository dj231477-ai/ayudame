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

/** Hora local 'HH:MM' para una tz, a partir de un instante. */
export function localTimeHHMM(date: Date, timeZone: string): string {
  const m = localMinutes(date, timeZone);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Convierte 'HH:MM' o 'HH:MM:SS' a minutos desde medianoche. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

/** Offset de una tz respecto a UTC, en minutos, para el instante `date` (positivo = adelante de UTC). */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Rango [inicio, fin) en UTC de un día calendario local (§C-26, D-10: "hoy" en tz del
 * usuario para consultar Calendar/Tasks, no las próximas 24h desde `now`). Asume offset
 * estable durante el día — un día con transición de DST puede desviarse hasta 1h, aceptable
 * para agendar, no para contabilidad financiera.
 */
export function localDayRangeUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const noonGuess = new Date(`${dateStr}T12:00:00Z`);
  const offsetMin = tzOffsetMinutes(noonGuess, timeZone);
  const start = new Date(Date.parse(`${dateStr}T00:00:00Z`) - offsetMin * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}
