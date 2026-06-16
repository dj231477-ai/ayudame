import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// SPEC §C-17.3: readiness. Verifica conectividad a Supabase; 200/503.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = createServiceClient();
    const { error } = await db.from('feature_flags').select('key').limit(1);
    if (error) throw error;
    return NextResponse.json({ status: 'ready' });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
