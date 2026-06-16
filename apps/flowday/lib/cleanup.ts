import 'server-only';
import { retentionCutoff, type RetentionPlan } from '@flowday/core/retention/policy';
import { createServiceClient } from '@/lib/supabase/service';

// Job de limpieza escalable (§C-15.3, resuelve E1): por lotes, paginado, idempotente y reentrante.
const PAGE = 100;
const MAX_PAGES = 1000; // cota de seguridad

function planOf(p: string): RetentionPlan {
  return p === 'pro' || p === 'team' ? p : 'free';
}

export async function runCleanup(): Promise<{
  usersProcessed: number;
  photosRemoved: number;
  rowsDeleted: number;
}> {
  const svc = createServiceClient();
  let cursor = '00000000-0000-0000-0000-000000000000';
  let usersProcessed = 0;
  let photosRemoved = 0;
  let rowsDeleted = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: profiles } = await svc
      .from('profiles')
      .select('id, plan')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(PAGE);
    if (!profiles || profiles.length === 0) break;

    for (const p of profiles) {
      const plan = planOf(p.plan);
      const evCut = retentionCutoff(plan, 'evidence_photos').toISOString();
      const logCut = retentionCutoff(plan, 'usage_log').toISOString();
      const blkCut = retentionCutoff(plan, 'blocks_history').toISOString();

      // Evidencia vencida: borrar fotos de Storage y luego las filas (incluye huérfanos cuyo
      // bloque ya no existe; los objetos sin evidencia se barren al borrar el bloque padre).
      const { data: ev } = await svc
        .from('evidence')
        .select('photo_path')
        .eq('user_id', p.id)
        .lt('created_at', evCut);
      if (ev && ev.length > 0) {
        await svc.storage.from('evidence-photos').remove(ev.map((e) => e.photo_path));
        photosRemoved += ev.length;
        await svc.from('evidence').delete().eq('user_id', p.id).lt('created_at', evCut);
        rowsDeleted += ev.length;
      }

      await svc.from('usage_log').delete().eq('user_id', p.id).lt('created_at', logCut);
      await svc.from('blocks').delete().eq('user_id', p.id).lt('created_at', blkCut);
      usersProcessed++;
    }

    cursor = profiles[profiles.length - 1]!.id; // cursor estable por id (reentrante)
    if (profiles.length < PAGE) break;
  }

  return { usersProcessed, photosRemoved, rowsDeleted };
}
