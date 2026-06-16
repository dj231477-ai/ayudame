-- =============================================================================
-- Migration 100_blocks  [NORMATIVO — SPEC §C-7.2]
-- Bloques del horario. Máquina de estados en §C-13.2 (validación de transición en API).
-- Transiciones por usuario (skip/edit) y por n8n/backend (start/end/verified, service_role).
-- =============================================================================

create table blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  label       text not null,
  type        text not null,    -- 'deep' | 'admin' | 'body' | 'rest' | 'review'
  task_id     text,             -- ID de Google Tasks (opcional)
  status      text not null default 'pending', -- 'pending'|'active'|'awaiting_photo'|'verified'|'skipped'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index blocks_user_date_idx on blocks(user_id, date);

-- RLS [SPEC §C-8.2]: CRUD propio. Las transiciones disparadas por n8n usan service_role.
alter table blocks enable row level security;

create policy "blocks_select_own" on blocks
  for select using (auth.uid() = user_id);
create policy "blocks_insert_own" on blocks
  for insert with check (auth.uid() = user_id);
create policy "blocks_update_own" on blocks
  for update using (auth.uid() = user_id);
create policy "blocks_delete_own" on blocks
  for delete using (auth.uid() = user_id);

-- Mantiene updated_at al día en cada cambio.
create or replace function touch_blocks_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_blocks_touch
  before update on blocks
  for each row execute function touch_blocks_updated_at();
