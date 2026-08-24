-- =============================================================================
-- Migration 014_quiet_hours  [NORMATIVO — SPEC §C-7.1, §C-13.5c, D-12]
-- Horario de silencio personalizable para los avisos que origina el scheduler (push/WhatsApp,
-- incluido el modo de recordatorio frecuente, D-11). Ambos nulos por defecto: nunca se activa
-- solo, el usuario define su propio rango desde Ajustes.
-- =============================================================================

alter table profiles add column quiet_hours_start time;
alter table profiles add column quiet_hours_end time;
