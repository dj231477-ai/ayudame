import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockClient, type MockClient } from '../../tests/helpers/supabase-mock';

// SPEC §C-11.5, Fase 2 D-4: credenciales Google cifradas + refresco de access token.
// crypto, fetch y Supabase mockeados (encrypt/decrypt = identidad en test).

let mockClient: MockClient;
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));
vi.mock('@flowday/core/crypto', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));

import { getValidAccessToken, isGoogleConnected, redirectUri, exchangeCode, storeTokens } from './tokens';

const fetchMock = vi.fn();

beforeEach(() => {
  mockClient = createMockClient();
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('redirectUri', () => {
  it('usa NEXT_PUBLIC_APP_URL + ruta de callback', () => {
    expect(redirectUri()).toBe('https://app.test/api/v1/google/callback');
  });
});

describe('getValidAccessToken (§C-11.5)', () => {
  it('devuelve null si el usuario no tiene refresh_token', async () => {
    mockClient = createMockClient({ tableResults: { google_tokens: { data: null } } });
    expect(await getValidAccessToken('u1')).toBeNull();
  });

  it('devuelve el access_token cacheado si no ha expirado (sin llamar a Google)', async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    mockClient = createMockClient({
      tableResults: { google_tokens: { data: { refresh_token: 'rt', access_token: 'at-cache', expiry: future } } },
    });
    expect(await getValidAccessToken('u1')).toBe('at-cache');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresca contra Google si el access_token expiró y persiste el nuevo', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockClient = createMockClient({
      tableResults: { google_tokens: { data: { refresh_token: 'rt', access_token: 'old', expiry: past } } },
    });
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'at-new', expires_in: 3600 }) });
    expect(await getValidAccessToken('u1')).toBe('at-new');
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'google_tokens')).toBeDefined();
  });

  it('devuelve null si el refresh falla', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockClient = createMockClient({
      tableResults: { google_tokens: { data: { refresh_token: 'rt', access_token: 'old', expiry: past } } },
    });
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    expect(await getValidAccessToken('u1')).toBeNull();
  });
});

describe('isGoogleConnected', () => {
  it('true si hay fila de tokens, false si no', async () => {
    mockClient = createMockClient({ tableResults: { google_tokens: { data: { user_id: 'u1' } } } });
    expect(await isGoogleConnected('u1')).toBe(true);
    mockClient = createMockClient({ tableResults: { google_tokens: { data: null } } });
    expect(await isGoogleConnected('u1')).toBe(false);
  });
});

describe('exchangeCode / storeTokens', () => {
  it('exchangeCode intercambia el code por tokens', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) });
    const tokens = await exchangeCode('the-code');
    expect(tokens.access_token).toBe('a');
    expect(fetchMock.mock.calls[0]![0]).toContain('oauth2.googleapis.com/token');
  });

  it('exchangeCode lanza si Google responde error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(exchangeCode('bad')).rejects.toThrow(/google_token_exchange_401/);
  });

  it('storeTokens hace upsert por user_id', async () => {
    await storeTokens('u1', { access_token: 'a', refresh_token: 'r', expires_in: 3600 });
    const up = mockClient.log.find((l) => l.op === 'upsert' && l.table === 'google_tokens');
    expect(up).toBeDefined();
    expect((up?.payload as { user_id: string }).user_id).toBe('u1');
  });
});
