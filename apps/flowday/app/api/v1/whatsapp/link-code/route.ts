import { AppError, type Locale } from '@flowday/core/errors';
import { requireUser, ok, fail } from '@/lib/api/respond';
import { createServiceClient } from '@/lib/supabase/service';

// SPEC §C-11 / §C-13.10: genera un código de 6 dígitos para vincular WhatsApp.
// Escritura vía service_role (whatsapp_links no tiene policy de insert/update
// para el cliente, §C-8.2) — el vínculo real se confirma cuando el código
// llega por WhatsApp (POST /api/v1/webhooks/whatsapp-inbound), no aquí.
export const dynamic = 'force-dynamic';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST() {
  let locale: Locale = 'es';
  try {
    const ctx = await requireUser();
    locale = ctx.locale;

    const svc = createServiceClient();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error } = await svc
      .from('whatsapp_links')
      .upsert(
        { user_id: ctx.userId, link_code: code, link_code_expires: expiresAt },
        { onConflict: 'user_id' },
      );
    if (error) throw new AppError('internal');

    return ok({ code, expires_at: expiresAt });
  } catch (e) {
    return fail(e, locale);
  }
}
