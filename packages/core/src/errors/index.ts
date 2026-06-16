// =============================================================================
// Errores y catálogo i18n  [NORMATIVO — SPEC §C-14.2, R15, M4]
// AppError(code) + catálogo code -> { httpStatus, i18nKey } + mensajes ES/EN.
// Los errores técnicos NUNCA se muestran crudos: siempre se mapean (§C-14.2).
// =============================================================================

export type ErrorCode =
  | 'insufficient_credits'
  | 'block_state_invalid'
  | 'photo_too_large'
  | 'unsupported_media'
  | 'ai_vision_exhausted'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden_plan'
  | 'not_found'
  // 'bad_request': §C-11.1 exige 400 para validación; el catálogo §C-14.2 no traía un
  // código genérico de validación. Añadido por R2 para cubrir ese hueco.
  | 'bad_request'
  | 'internal';

export type Locale = 'es' | 'en';

interface ErrorMeta {
  httpStatus: number;
  i18nKey: string;
}

// Catálogo [NORMATIVO — §C-14.2]
export const ERROR_CATALOG: Record<ErrorCode, ErrorMeta> = {
  insufficient_credits: { httpStatus: 402, i18nKey: 'error.insufficient_credits' },
  block_state_invalid: { httpStatus: 409, i18nKey: 'error.block_state_invalid' },
  photo_too_large: { httpStatus: 400, i18nKey: 'error.photo_too_large' },
  unsupported_media: { httpStatus: 400, i18nKey: 'error.unsupported_media' },
  ai_vision_exhausted: { httpStatus: 503, i18nKey: 'error.ai_vision_exhausted' },
  rate_limited: { httpStatus: 429, i18nKey: 'error.rate_limited' },
  unauthorized: { httpStatus: 401, i18nKey: 'error.unauthorized' },
  forbidden_plan: { httpStatus: 403, i18nKey: 'error.forbidden_plan' },
  not_found: { httpStatus: 404, i18nKey: 'error.not_found' },
  bad_request: { httpStatus: 400, i18nKey: 'error.bad_request' },
  internal: { httpStatus: 500, i18nKey: 'error.internal' },
};

// Mensajes i18n. ES por defecto (R15). EN disponible.
export const ERROR_MESSAGES: Record<Locale, Record<ErrorCode, string>> = {
  es: {
    insufficient_credits: 'Créditos insuficientes. Recarga para continuar.',
    block_state_invalid: 'Ese bloque no está listo para esta acción.',
    photo_too_large: 'La foto supera 5 MB.',
    unsupported_media: 'Formato de imagen no soportado.',
    ai_vision_exhausted: 'Verificación no disponible ahora; tu foto quedó guardada.',
    rate_limited: 'Demasiadas solicitudes, intenta en un momento.',
    unauthorized: 'Necesitas iniciar sesión.',
    forbidden_plan: 'Esta función requiere un plan superior.',
    not_found: 'No encontramos lo que buscas.',
    bad_request: 'Solicitud inválida.',
    internal: 'Algo salió mal. Intenta de nuevo.',
  },
  en: {
    insufficient_credits: 'Not enough credits. Top up to continue.',
    block_state_invalid: 'That block is not ready for this action.',
    photo_too_large: 'The photo exceeds 5 MB.',
    unsupported_media: 'Unsupported image format.',
    ai_vision_exhausted: 'Verification unavailable right now; your photo was saved.',
    rate_limited: 'Too many requests, try again shortly.',
    unauthorized: 'You need to sign in.',
    forbidden_plan: 'This feature requires a higher plan.',
    not_found: "We couldn't find what you're looking for.",
    bad_request: 'Invalid request.',
    internal: 'Something went wrong. Please try again.',
  },
};

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Error de dominio con un código del catálogo (§C-14.2). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ERROR_CATALOG[code].httpStatus;
    if (details !== undefined) this.details = details;
  }
}

/** Devuelve el mensaje localizado para un código (§C-14.2). */
export function getErrorMessage(code: ErrorCode, locale: Locale = 'es'): string {
  return ERROR_MESSAGES[locale][code];
}

/** Normaliza cualquier error a AppError (los desconocidos → 'internal', sin filtrar detalles). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Mapeo de errores conocidos lanzados por RPC (p. ej. 'insufficient_credits' de Postgres).
  if (err instanceof Error && err.message in ERROR_CATALOG) {
    return new AppError(err.message as ErrorCode);
  }
  return new AppError('internal');
}

/** Construye el cuerpo de respuesta uniforme (§C-11.1) y su status HTTP. */
export function toErrorResponse(
  err: unknown,
  locale: Locale = 'es',
): { status: number; body: ErrorResponseBody } {
  const appErr = toAppError(err);
  const body: ErrorResponseBody = {
    error: {
      code: appErr.code,
      message: getErrorMessage(appErr.code, locale),
      ...(appErr.details ? { details: appErr.details } : {}),
    },
  };
  return { status: appErr.httpStatus, body };
}
