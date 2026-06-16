-- =============================================================================
-- Migration 105_google_tokens  [SPEC §C-1.2 #8, §C-11.5 — decisión Fase 2]
-- Credenciales OAuth de Google para acceso OFFLINE (Tasks/Calendar). Tokens CIFRADOS
-- en reposo (AES-256-GCM, @flowday/core/crypto). Tabla INTERNA: RLS sin políticas ⇒
-- solo service_role; los tokens jamás llegan al cliente (INV-4).
-- Añadida por R2 tras aprobar la decisión de persistencia de tokens.
-- =============================================================================

create table google_tokens (
  user_id       uuid primary key references profiles(id) on delete cascade,
  refresh_token text not null,  -- cifrado
  access_token  text,           -- cifrado (cache de corta vida)
  expiry        timestamptz,
  scope         text,
  updated_at    timestamptz not null default now()
);

alter table google_tokens enable row level security;
-- Sin políticas: inaccesible salvo service_role.
