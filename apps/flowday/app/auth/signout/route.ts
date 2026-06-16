import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Cierre de sesión. SPEC §C-13.8 (revoca sesión).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
