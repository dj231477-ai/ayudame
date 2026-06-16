-- =============================================================================
-- Migration 009_processed_events  [NORMATIVO — SPEC §C-7.1]
-- Idempotencia de webhooks (INV-6, §C-12.4). Registro del event_id ya procesado.
-- Tabla INTERNA: RLS activado, SIN políticas => solo service_role (§C-8.3, R8).
-- =============================================================================

create table processed_events (
  event_id     text primary key,        -- id del evento Stripe o n8n
  source       text not null,           -- 'stripe' | 'n8n'
  processed_at timestamptz not null default now()
);

alter table processed_events enable row level security;
-- Sin políticas: inaccesible salvo service_role.
