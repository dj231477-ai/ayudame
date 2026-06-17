import 'server-only';
import type { FlowDayClient } from '@flowday/core/auth';
import { retentionCutoff, type RetentionPlan } from '@flowday/core/retention/policy';
import { createServiceClient } from '@/lib/supabase/service';

// Job de limpieza escalable (§C-15.3, resuelve E1): por lotes, paginado, idempotente y reentrante.
const PAGE = 100;
const MAX_PAGES = 1000; // cota de seguridad
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000; // §C-14.4: objetos huérfanos con > 24 h
const STORAGE_LIST_LIMIT = 1000;

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

      // §C-14.4 / §C-15.3 punto 3: recoge objetos de Storage sin evidence asociada (> 24 h):
      // fotos subidas pero nunca verificadas, o de verificaciones abandonadas.
      photosRemoved += await removeOrphanPhotos(svc, p.id);
      usersProcessed++;
    }

    cursor = profiles[profiles.length - 1]!.id; // cursor estable por id (reentrante)
    if (profiles.length < PAGE) break;
  }

  return { usersProcessed, photosRemoved, rowsDeleted };
}

/**
 * Barrido de objetos huérfanos de Storage de un usuario (§C-14.4 / §C-15.3 punto 3).
 *
 * Huérfano = objeto en `evidence-photos` bajo el prefijo del usuario que NO está referenciado por
 * ninguna fila `evidence` ni por una entrada `verification_queue` pendiente (cola de visión agotada,
 * §C-14.3). Casos: foto subida pero `verify-photo` nunca llamado, o verificación abandonada.
 *
 * Sólo se borran objetos con > 24 h (ORPHAN_AGE_MS) para no pisar verificaciones en vuelo. El layout
 * del bucket es `{user_id}/{block_id}/{ts}.jpg`, así que se lista en dos niveles con la API tipada.
 * Idempotente y reentrante: reconstruye el conjunto a conservar en cada pasada.
 */
async function removeOrphanPhotos(svc: FlowDayClient, userId: string): Promise<number> {
  // Conjunto a conservar: paths referenciados por evidence (ya filtrada de vencidas) o en cola pendiente.
  const keep = new Set<string>();
  const [{ data: evRows }, { data: queued }] = await Promise.all([
    svc.from('evidence').select('photo_path').eq('user_id', userId),
    svc.from('verification_queue').select('photo_path').eq('user_id', userId),
  ]);
  for (const r of evRows ?? []) keep.add(r.photo_path);
  for (const r of queued ?? []) keep.add(r.photo_path);

  const bucket = svc.storage.from('evidence-photos');
  const cutoff = Date.now() - ORPHAN_AGE_MS;
  const toRemove: string[] = [];

  // Nivel 1: carpetas {block_id} bajo el prefijo del usuario (las carpetas vienen con id === null).
  const { data: blockDirs } = await bucket.list(userId, { limit: STORAGE_LIST_LIMIT });
  for (const dir of blockDirs ?? []) {
    if (dir.id !== null) continue; // sólo descendemos por carpetas, no por ficheros sueltos
    const prefix = `${userId}/${dir.name}`;
    // Nivel 2: ficheros {ts}.jpg dentro de la carpeta del bloque.
    const { data: files } = await bucket.list(prefix, { limit: STORAGE_LIST_LIMIT });
    for (const f of files ?? []) {
      if (f.id === null) continue; // ignora subcarpetas inesperadas
      const path = `${prefix}/${f.name}`;
      if (keep.has(path)) continue;
      const created = new Date(f.created_at ?? f.updated_at ?? 0).getTime();
      if (created < cutoff) toRemove.push(path);
    }
  }

  if (toRemove.length === 0) return 0;
  const { error } = await bucket.remove(toRemove);
  if (error) return 0; // el objeto sigue ahí; la próxima pasada reintenta (reentrante)
  return toRemove.length;
}
