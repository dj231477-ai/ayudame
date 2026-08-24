import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

// Autorización de los endpoints /internal/* (§C-11.7): secreto compartido en cabecera
// `x-internal-secret`, validado contra INTERNAL_ADMIN_SECRET (INV-4, solo backend).

/**
 * Compara dos cadenas en tiempo constante (M-5): evita filtrar el secreto por timing. Se comparan
 * los digests SHA-256 (siempre 32 bytes), de modo que timingSafeEqual nunca recibe longitudes
 * distintas ni se revela la longitud del secreto.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/** true si la request trae el secreto interno correcto (comparación en tiempo constante). */
export function authorizeInternal(request: Request): boolean {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  const provided = request.headers.get('x-internal-secret');
  if (!secret || !provided) return false;
  return constantTimeEqual(secret, provided);
}
