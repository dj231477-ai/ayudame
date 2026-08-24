-- =============================================================================
-- Migration 013_frequent_reminders  [NORMATIVO — SPEC §C-7.1, §C-13.5b, D-11]
-- Modo de recordatorio frecuente, opt-in y desmarcado por defecto (accesibilidad —
-- TDAH/memoria débil). El usuario lo activa él mismo desde Ajustes; nunca viene activado.
-- =============================================================================

alter table profiles add column frequent_reminders boolean not null default false;
