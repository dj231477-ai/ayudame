-- =============================================================================
-- Migration 111_blocks_calendar_event_id  [NORMATIVO — SPEC §C-7.2, §C-26.7c, D-26]
-- Id del evento de Google Calendar creado para este bloque (auto_organize_tasks, §C-26.7c) —
-- null si el bloque no vino de una tarea, si el usuario no tiene el flag activo, o si la
-- creación en Calendar falló (best-effort, nunca bloquea la planificación). Permite reusar el
-- mismo evento en vez de duplicarlo en llamadas posteriores a getOrComputeDailyPlan.
-- =============================================================================

alter table blocks add column calendar_event_id text;
