import { describe, it, expect } from 'vitest';
import { hmacSha256Hex, verifyHmacSignature } from './hmac';

// SPEC §C-12.3 / §C-18.2 / INV-5: firma inválida ⇒ rechazo.
describe('verifyHmacSignature (§C-12.3, INV-5)', () => {
  const secret = 'n8n-secret';
  const body = '{"event_id":"e1","action":"start_block","user_id":"u1","block_id":"b1","ts":"2026-06-13T00:00:00Z"}';

  it('acepta una firma válida', () => {
    const sig = hmacSha256Hex(body, secret);
    expect(verifyHmacSignature(body, sig, secret)).toBe(true);
  });

  it('rechaza firma incorrecta', () => {
    expect(verifyHmacSignature(body, 'deadbeef', secret)).toBe(false);
  });

  it('rechaza firma vacía', () => {
    expect(verifyHmacSignature(body, '', secret)).toBe(false);
  });

  it('rechaza si el cuerpo cambió (tamper)', () => {
    const sig = hmacSha256Hex(body, secret);
    expect(verifyHmacSignature(body + 'x', sig, secret)).toBe(false);
  });
});
