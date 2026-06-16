import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './index';

// SPEC: cifrado de tokens Google en reposo (Fase 2 D).
describe('crypto AES-256-GCM', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-please-rotate';
  });

  it('roundtrip encrypt/decrypt', () => {
    const plain = 'refresh-token-abc-123';
    const enc = encrypt(plain);
    expect(enc).not.toContain(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  it('cada cifrado usa un IV distinto', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('falla al descifrar un texto manipulado (auth tag)', () => {
    const enc = encrypt('secret');
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'BB' : 'AA');
    expect(() => decrypt(tampered)).toThrow();
  });
});
