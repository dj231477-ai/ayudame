-- =============================================================================
-- Migration 103_challenges  [NORMATIVO — SPEC §C-7.2]
-- Gamificación compartida (tier Team). INV-1 permite visibilidad mutua dentro de un
-- challenge al que ambos pertenecen. El flujo completo de invitaciones es Fase 4;
-- aquí se crean las tablas con RLS correcta (sin recursión, vía helpers definer).
-- =============================================================================

create table challenges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now()
);

create table challenge_members (
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- Helpers SECURITY DEFINER para romper la recursión de RLS entre las dos tablas.
create or replace function is_challenge_member(p_challenge_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(
    select 1 from challenge_members
    where challenge_id = p_challenge_id and user_id = p_user_id
  );
$$;

create or replace function is_challenge_owner(p_challenge_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(
    select 1 from challenges
    where id = p_challenge_id and owner_id = p_user_id
  );
$$;

revoke all on function is_challenge_member(uuid, uuid) from public;
revoke all on function is_challenge_owner(uuid, uuid) from public;
grant execute on function is_challenge_member(uuid, uuid) to authenticated, service_role;
grant execute on function is_challenge_owner(uuid, uuid) to authenticated, service_role;

-- RLS challenges: el dueño gestiona; los miembros pueden leer (INV-1).
alter table challenges enable row level security;
create policy "challenges_select_member_or_owner" on challenges
  for select using (owner_id = auth.uid() or is_challenge_member(id, auth.uid()));
create policy "challenges_insert_owner" on challenges
  for insert with check (owner_id = auth.uid());
create policy "challenges_update_owner" on challenges
  for update using (owner_id = auth.uid());
create policy "challenges_delete_owner" on challenges
  for delete using (owner_id = auth.uid());

-- RLS challenge_members: el miembro ve su fila; el dueño ve las del challenge.
alter table challenge_members enable row level security;
create policy "challenge_members_select" on challenge_members
  for select using (user_id = auth.uid() or is_challenge_owner(challenge_id, auth.uid()));
create policy "challenge_members_insert_self" on challenge_members
  for insert with check (user_id = auth.uid());
create policy "challenge_members_delete" on challenge_members
  for delete using (user_id = auth.uid() or is_challenge_owner(challenge_id, auth.uid()));
