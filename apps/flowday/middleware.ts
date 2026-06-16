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

export async function middleware(request: NextRequest) {
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
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Excluye estáticos y assets PWA del middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)'],
};
