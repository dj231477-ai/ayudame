import { type Locale } from '@flowday/core/errors';
import { requireUser, fail } from '@/lib/api/respond';
import { exportUserData } from '@/lib/account';

// SPEC §C-15.4: derecho de acceso — exporta los datos del usuario en JSON.
export const dynamic = 'force-dynamic';

export async function GET() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;
    const data = await exportUserData(ctx.supabase, ctx.userId);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-disposition': 'attachment; filename="flowday-export.json"',
      },
    });
  } catch (e) {
    return fail(e, locale);
  }
}
