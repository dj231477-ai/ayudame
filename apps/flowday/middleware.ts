import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@flowday/core/auth';

// Refresca la sesión en cada request y protege el grupo (auth). SPEC §C-8.6, §C-11.1.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/focus',
  '/history',
  '/settings',
  '/analytics',
  '/challenges',
];

/**
 * CSP con nonce por request (§C-8.7, M-4): elimina 'unsafe-inline' de script-src. Next.js inyecta
 * el nonce en sus <script> al leer la CSP de la cabecera de la request. 'strict-dynamic' propaga la
 * confianza a los scripts cargados por los ya nonce-ados (incluye Stripe.js cuando se integre); los
 * navegadores que no lo soporten caen al allowlist de host. style-src mantiene 'unsafe-inline'
 * (Next.js inyecta estilos inline; fuera del alcance de M-4).
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  // La CSP viaja en la request para que Next.js lea el nonce e inyecte sus propios scripts;
  // x-nonce queda disponible para cualquier <script>/<Script> propio que lo necesite.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request });

  const supabase = createServerClient({
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (toSet) => {
      for (const { name, value } of toSet) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
    },
  });

  // getUser() valida el token contra Supabase (refresca cookies si procede).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', path);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Excluye estáticos y assets PWA del middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)'],
};
