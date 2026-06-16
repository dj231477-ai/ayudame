-- =============================================================================
-- Migration 007_feature_flags  [NORMATIVO — SPEC §C-7.1]
-- Estado global de activación de features/tiers (§C-9.7, §C-19.5). La UI los lee
-- vía backend (nunca directo). Activar un tier = poner su flag en true (no despliega código).
-- Tabla INTERNA: RLS activado, SIN políticas => solo service_role (§C-8.3, R8).
-- =============================================================================

create table feature_flags (
  key         text primary key,         -- 'pro_tier_active' | 'team_tier_active' | 'free_photo_limit' | ...
  value       jsonb not null,           -- booleano o config: { "limit": 5 }
  updated_at  timestamptz not null default now()
);

alter table feature_flags enable row level security;
-- Sin políticas: inaccesible salvo service_role.

-- Semillas por defecto (§C-9.7): tiers desactivados hasta cruzar umbrales; límite free desactivado.
insert into feature_flags (key, value) values
  ('pro_tier_active',  'false'::jsonb),
  ('team_tier_active', 'false'::jsonb),
  ('free_photo_limit', '{"enabled": false, "limit": 5}'::jsonb)
on conflict (key) do nothing;
