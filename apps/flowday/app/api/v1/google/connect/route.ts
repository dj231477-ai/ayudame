import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, fail } from '@/lib/api/respond';
import { GOOGLE_SCOPES, redirectUri } from '@/lib/google/tokens';

// Inicia el consentimiento OAuth de Google con acceso OFFLINE (Tasks). §C-11.5, §C-13.1 paso 6.
export const dynamic = 'force-dynamic';

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser(); // exige sesión
    locale = ctx.locale;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError('internal');

    const state = randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent', // fuerza refresh_token
      state,
    });

    const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    res.cookies.set('g_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (e) {
    return fail(e, locale);
  }
}
