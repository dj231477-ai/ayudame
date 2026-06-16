// =============================================================================
// Verificación de firma HMAC  [NORMATIVO — SPEC §C-12.3, INV-5]
// Firma inválida ⇒ rechazar (401), sin efectos secundarios. Comparación en tiempo
// constante para evitar timing attacks.
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** true si `signature` (hex) coincide con HMAC-SHA256(body, secret). */
export function verifyHmacSignature(body: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = hmacSha256Hex(body, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
