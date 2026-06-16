-- =============================================================================
-- Migration 000_profiles  [NORMATIVO — SPEC §C-7.1]
-- Tabla compartida: perfil de usuario. PK referencia auth.users.
-- RLS: SPEC §C-8.2 (profiles usa id = auth.uid() como clave de propiedad).
-- =============================================================================

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  handle      text unique,                  -- para perfil público u/[handle] (§C-13.7)
  plan        text not null default 'free', -- 'free' | 'pro' | 'team'
  streak      integer not null default 0,
  timezone    text not null default 'America/Bogota',
  locale      text not null default 'es',   -- 'es' | 'en'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS [SPEC §C-8.2]
alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

-- El cliente puede editar su perfil, PERO 'plan' y 'streak' son privilegiados:
-- §C-8.2 "Escrituras sensibles (saldo, plan) se hacen solo vía RPC/backend con service_role".
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- INSERT/DELETE de profiles los hace el trigger handle_new_user (§C-7.4 / migración 010)
-- y el cascade desde auth.users; el cliente no inserta/borra perfiles directamente.

-- Protección de columnas privilegiadas (plan, streak): solo service_role puede mutarlas.
create or replace function protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.plan is distinct from old.plan or new.streak is distinct from old.streak)
     and coalesce(auth.role(), 'anon') <> 'service_role' then
    raise exception 'profile_privileged_column_violation'
      using hint = 'plan/streak solo se modifican vía backend service_role';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_protect_profile_privileged
  before update on profiles
  for each row execute function protect_profile_privileged_columns();
