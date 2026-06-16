import 'server-only';
import { encrypt, decrypt } from '@flowday/core/crypto';
import { logger } from '@flowday/core/observability/logger';
import { createServiceClient } from '@/lib/supabase/service';

// Persistencia y refresco de credenciales Google (offline). Tokens cifrados (§Fase 2 D).
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
// Tasks (Pro+ Calendar): se piden ambos scopes en el connect; Calendar se gatea por plan.
export const GOOGLE_SCOPES = `${GOOGLE_TASKS_SCOPE} ${GOOGLE_CALENDAR_SCOPE}`;

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function clientCreds(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('google_oauth_not_configured');
  return { id, secret };
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/api/v1/google/callback`;
}

/** Intercambia el code por tokens (grant_type=authorization_code). */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const { id, secret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`google_token_exchange_${res.status}`);
  return (await res.json()) as GoogleTokenResponse;
}

/** Guarda los tokens cifrados (upsert por user_id). */
export async function storeTokens(
  userId: string,
  tokens: GoogleTokenResponse,
): Promise<void> {
  if (!tokens.refresh_token) {
    // Sin refresh_token no hay acceso offline; suele faltar si el usuario ya consintió antes
    // sin prompt=consent. El connect fuerza prompt=consent para obtenerlo.
    logger.warn({ event: 'google.no_refresh_token', user_id: userId });
  }
  const svc = createServiceClient();
  const row = {
    user_id: userId,
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : '',
    access_token: encrypt(tokens.access_token),
    expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    ...(tokens.scope ? { scope: tokens.scope } : {}),
  };
  await svc.from('google_tokens').upsert(row, { onConflict: 'user_id' });
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiry: number }> {
  const { id, secret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`google_token_refresh_${res.status}`);
  const json = (await res.json()) as GoogleTokenResponse;
  return { accessToken: json.access_token, expiry: Date.now() + json.expires_in * 1000 };
}

/** Devuelve un access_token válido (refresca si caducó) o null si no está conectado. */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('google_tokens')
    .select('refresh_token, access_token, expiry')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || !data.refresh_token) return null;

  const now = Date.now();
  if (data.access_token && data.expiry && new Date(data.expiry).getTime() - 60_000 > now) {
    return decrypt(data.access_token);
  }
  try {
    const refreshed = await refreshAccessToken(decrypt(data.refresh_token));
    await svc
      .from('google_tokens')
      .update({
        access_token: encrypt(refreshed.accessToken),
        expiry: new Date(refreshed.expiry).toISOString(),
      })
      .eq('user_id', userId);
    return refreshed.accessToken;
  } catch {
    logger.warn({ event: 'google.refresh_failed', user_id: userId });
    return null;
  }
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('google_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data !== null;
}
