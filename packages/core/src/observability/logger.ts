// =============================================================================
// Logger estructurado  [NORMATIVO — SPEC §C-17.1]
// Emite JSON con timestamp, level, event, request_id, user_id?, route?, latency_ms?,
// provider? (IA), error.code? cuando falla. NUNCA loguea PII sensible, secretos ni
// contenido de fotos (§C-17.1).
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  event: string;
  request_id?: string;
  user_id?: string;
  route?: string;
  latency_ms?: number;
  provider?: string;
  status?: number;
  error?: { code: string };
  // Campos extra permitidos siempre que NO contengan PII/secretos/foto.
  [key: string]: unknown;
}

// Claves que jamás deben aparecer en un log (defensa, §C-17.1).
const REDACTED_KEYS = new Set([
  'password',
  'token',
  'secret',
  'service_role',
  'authorization',
  'photo',
  'photo_url',
  'image',
  'p256dh',
  'auth',
]);

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: LogLevel, fields: LogFields): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    ...sanitize(fields),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
  /** Crea un logger hijo con campos base fijos (p. ej. request_id, route). */
  child(base: Partial<LogFields>): Logger;
}

function createLogger(base: Partial<LogFields> = {}): Logger {
  const withBase = (fields: LogFields): LogFields => ({ ...base, ...fields });
  return {
    debug: (f) => emit('debug', withBase(f)),
    info: (f) => emit('info', withBase(f)),
    warn: (f) => emit('warn', withBase(f)),
    error: (f) => emit('error', withBase(f)),
    child: (childBase) => createLogger({ ...base, ...childBase }),
  };
}

export const logger: Logger = createLogger();

/** Genera un request_id para correlación de logs (§C-17.1). */
export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
