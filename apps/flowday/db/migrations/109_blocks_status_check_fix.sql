-- =============================================================================
-- Migration 109_blocks_status_check_fix  [NORMATIVO — SPEC §C-7.2, D-18]
-- El CHECK constraint de blocks.status en producción nunca se actualizó cuando D-10 introdujo
-- 'awaiting_start_photo' — seguía rechazando ese valor desde el servidor (algunas rutas
-- devolvían 500; otras, que no revisan el error de esa escritura puntual, fallaban en silencio
-- dejando el bloque atascado en 'pending'). Encontrado probando con Playwright contra la cuenta
-- real (no un test unitario — ninguno ejercitaba el constraint real de Postgres).
-- =============================================================================

alter table blocks drop constraint blocks_status_check;
alter table blocks add constraint blocks_status_check
  check (status = any (array['pending', 'awaiting_start_photo', 'active', 'awaiting_photo', 'verified', 'skipped']));
