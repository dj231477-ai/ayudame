-- =============================================================================
-- Migration 109_blocks_status_check_fix  [NORMATIVO — SPEC §C-7.2, D-18]
-- El CHECK constraint de blocks.status en producción nunca se actualizó cuando D-10 introdujo
-- 'awaiting_start_photo' — seguía rechazando ese valor desde el servidor (algunas rutas
-- devolvían 500; otras, que no revisan el error de esa escritura puntual, fallaban en silencio
-- dejando el bloque atascado en 'pending'). Encontrado probando con Playwright contra la cuenta
-- real (no un test unitario — ninguno ejercitaba el constraint real de Postgres).
--
-- Idempotencia (2026-08-27): el `drop` era incondicional y abortaba cualquier instalación desde
-- cero — 100_blocks.sql declara `status` como `text` plano, sin CHECK, así que `blocks_status_check`
-- no existe en una base nueva. Rompía el job rls-tests del CI y cualquier entorno local/staging
-- levantado desde las migraciones. Sobre una base donde el constraint SÍ existe (producción, donde
-- esta migración ya se aplicó) el comportamiento es idéntico: `if exists` no cambia nada.
-- =============================================================================

alter table blocks drop constraint if exists blocks_status_check;
alter table blocks add constraint blocks_status_check
  check (status = any (array['pending', 'awaiting_start_photo', 'active', 'awaiting_photo', 'verified', 'skipped']));
