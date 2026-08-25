-- =============================================================================
-- Migration 016_auto_organize_tasks  [NORMATIVO — SPEC §C-7.1, §C-26.7c, D-26]
-- Interruptor opt-in, desactivado por defecto: cuando está activo, el planificador (§C-26)
-- también toma tareas de Google Tasks SIN `due` (además de las vencidas/de hoy, §C-26.7) y,
-- por cada bloque que arma a partir de una tarea, crea el evento correspondiente en el Google
-- Calendar real del usuario (requiere haber reconectado Google con el scope de escritura,
-- §C-26.7c). Desactivado por defecto: la organización proactiva del backlog sin fecha y la
-- escritura en Calendar son un cambio de comportamiento real, nunca automático sin pedirlo.
-- =============================================================================

alter table profiles add column auto_organize_tasks boolean not null default false;
