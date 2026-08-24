import { NextResponse, type NextRequest } from 'next/server';
import { logger, newRequestId } from '@flowday/core/observability/logger';
import { createClient } from '@/lib/supabase/server';
import { runSignupOnboarding } from '@/lib/auth/onboarding';

// Callback OAuth de Supabase (Google). SPEC §C-13.1 pasos 3–4 y §C-16.4.
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  // Supabase/Google pueden volver con error en la query en vez de con code.
  const providerError = searchParams.get('error');
  const providerErrorDescription = searchParams.get('error_description');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // El trigger handle_new_user ya creó profiles + credits; aquí acreditamos el stipend (idempotente).
        await runSignupOnboarding(user.id);
        logger.info({ event: 'auth.callback_ok', request_id: requestId, user_id: user.id, route: '/auth/callback' });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Loguea el motivo REAL del fallo de intercambio (PKCE/verifier, etc.) para diagnóstico.
    logger.warn({
      event: 'auth.exchange_failed',
      request_id: requestId,
      route: '/auth/callback',
      error: { code: error.code ?? 'exchange_failed' },
      exchange_error_message: error.message,
      exchange_error_status: error.status,
    });
  } else {
    logger.warn({
      event: 'auth.callback_no_code',
      request_id: requestId,
      route: '/auth/callback',
      provider_error: providerError,
      provider_error_description: providerErrorDescription,
    });
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
