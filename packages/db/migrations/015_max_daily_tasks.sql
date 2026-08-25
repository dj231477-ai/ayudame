-- =============================================================================
-- Migration 015_max_daily_tasks  [NORMATIVO — SPEC §C-7.1, §C-26.7, D-25]
-- Tope de tareas de Google Tasks que el planificador (§C-26) puede encajar en un mismo día,
-- sin importar cuántas tareas elegibles (due <= hoy, §C-26.7) tenga el usuario. Pedido
-- explícito del usuario: aunque haya 40 tareas vencidas, nunca se asignan más de las que él
-- configuró. Default 5 — moderado, no inunda el día de nadie que no lo haya tocado.
-- =============================================================================

alter table profiles add column max_daily_tasks smallint not null default 5
  check (max_daily_tasks >= 1 and max_daily_tasks <= 20);
