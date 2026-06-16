// =============================================================================
// Cifrado simétrico AES-256-GCM  [SPEC: decisión Fase 2 — google_tokens cifrados]
// Para datos sensibles en reposo (refresh tokens de Google). Clave derivada de
// TOKEN_ENCRYPTION_KEY (INV-4: secreto solo en backend). Formato: iv.tag.ciphertext (base64).
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY missing');
  return scryptSync(raw, 'flowday-token-salt', 32);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('invalid_ciphertext');
  const [ivB, tagB, encB] = parts as [string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
