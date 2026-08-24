import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { localDate } from '@/lib/datetime';

// SPEC §C-13.5e, D-12: resumen breve de refuerzo positivo para el cierre del día por WhatsApp
// — bloques verificados hoy sobre el total, y racha actual — en vez de terminar en seco.

export async function getDaySummaryText(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  tz: string,
): Promise<string> {
  const today = localDate(new Date(), tz);
  const [{ data: blocks }, { data: profile }] = await Promise.all([
    svc.from('blocks').select('status').eq('user_id', userId).eq('date', today),
    svc.from('profiles').select('streak').eq('id', userId).single(),
  ]);

  const total = blocks?.length ?? 0;
  if (total === 0) return '';
  const verified = (blocks ?? []).filter((b) => b.status === 'verified').length;
  const streak = profile?.streak ?? 0;

  return ` Hoy verificaste ${verified}/${total} bloque(s). Racha: ${streak} día(s).`;
}
