-- =============================================================================
-- Migration 006_monetization_events  [NORMATIVO — SPEC §C-7.1]
-- Log interno de triggers de monetización (§C-9.7) y eventos sin PII
-- (p. ej. 'account_deleted', §C-15.4).
-- Tabla INTERNA: RLS activado, SIN políticas => solo service_role (§C-8.3, R8).
-- =============================================================================

create table monetization_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,  -- 'limit_applied' | 'upgrade_email_sent' | 'tier_activated' | 'account_deleted' | ...
  payload     jsonb,
  created_at  timestamptz not null default now()
);

alter table monetization_events enable row level security;
-- Sin políticas: inaccesible salvo service_role.
