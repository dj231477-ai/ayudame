import 'server-only';
import { NextResponse } from 'next/server';
import { AppError, toErrorResponse, type Locale } from '@flowday/core/errors';
import type { FlowDayClient } from '@flowday/core/auth';
import { createClient } from '@/lib/supabase/server';

// Helpers comunes de API. SPEC §C-11.1 (forma uniforme de error, auth).

export interface AuthedContext {
  userId: string;
  email: string | undefined;
  locale: Locale;
  supabase: FlowDayClient;
}

/** Exige sesión; lanza AppError('unauthorized') (401) si no hay usuario. */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('unauthorized');
  const locale: Locale = user.user_metadata?.locale === 'en' ? 'en' : 'es';
  return { userId: user.id, email: user.email, locale, supabase };
}

/** Respuesta JSON de éxito. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** Mapea cualquier error a la forma uniforme { error: { code, message, details? } }. */
export function fail(err: unknown, locale: Locale = 'es'): NextResponse {
  const { status, body } = toErrorResponse(err, locale);
  return NextResponse.json(body, { status });
}
