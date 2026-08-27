-- =============================================================================
-- Migration 110_blocks_touch_trigger_backfill  [NORMATIVO — SPEC §C-7.2, D-19]
-- Backfill (2026-08-24): trg_blocks_touch (before update on blocks, definido en 100_blocks.sql)
-- nunca existió en producción — confirmado contra pg_trigger, cero filas. blocks.updated_at
-- jamás se actualizaba en ningún UPDATE, rompiendo todo lo que depende de la edad del bloque
-- (auto-skip de awaiting_start_photo/PHOTO_WINDOW_MIN, recordatorios §C-13.5, "posponer"
-- §C-13.5d). Mismo patrón de drift que el backfill de 106_reorg_cache.sql: el archivo estaba
-- committeado, pero la operación real nunca se ejecutó contra la base de datos de producción.
-- Recrea exactamente lo que 100_blocks.sql ya especificaba.
--
-- Idempotencia (2026-08-27): el `create trigger` era incondicional y fallaba con "trigger already
-- exists" en cualquier instalación desde cero, porque 100_blocks.sql:42 ya lo crea. En producción
-- el trigger no existía (de ahí este backfill), así que allí el `drop ... if exists` es un no-op y
-- el resultado no cambia.
-- =============================================================================

create or replace function touch_blocks_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_blocks_touch on blocks;
create trigger trg_blocks_touch
  before update on blocks
  for each row execute function touch_blocks_updated_at();
