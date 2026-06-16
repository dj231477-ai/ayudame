import { NextResponse } from 'next/server';

// SPEC §C-17.3: liveness. 200 si la app responde.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'flowday', ts: new Date().toISOString() });
}
