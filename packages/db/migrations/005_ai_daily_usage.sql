-- =============================================================================
-- Migration 005_ai_daily_usage  [NORMATIVO — SPEC §C-7.1]
-- Contador por proveedor y día (interno). El incremento primario lo hace la app
-- vía increment_ai_usage dentro de callAI (§C-10.4). Reset implícito por fecha.
-- Tabla INTERNA: RLS activado, SIN políticas => solo service_role (§C-8.3, R8).
-- =============================================================================

create table ai_daily_usage (
  provider      text not null,
  date          date not null default current_date,
  request_count integer not null default 0,
  token_count   bigint  not null default 0,
  primary key (provider, date)
);

alter table ai_daily_usage enable row level security;
-- Sin políticas: inaccesible salvo service_role.
