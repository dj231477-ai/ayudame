import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@flowday/core/observability/logger';
import { requireUser } from '@/lib/api/respond';
import { exchangeCode, storeTokens } from '@/lib/google/tokens';

// Callback OAuth de Google: valida state (CSRF), intercambia code y guarda tokens cifrados.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireUser();
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = (await cookies()).get('g_oauth_state')?.value;

    if (!code || !state || !cookieState || state !== cookieState) {
      return NextResponse.redirect(new URL('/settings?google=error', request.url));
    }

    const tokens = await exchangeCode(code);
    await storeTokens(ctx.userId, tokens);
    logger.info({ event: 'google.connected', user_id: ctx.userId });

    const res = NextResponse.redirect(new URL('/settings?google=connected', request.url));
    res.cookies.delete('g_oauth_state');
    return res;
  } catch {
    return NextResponse.redirect(new URL('/settings?google=error', request.url));
  }
}
