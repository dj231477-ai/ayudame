-- =============================================================================
-- Migration 102_habits  [NORMATIVO — SPEC §C-7.2]
-- Hábitos diarios del usuario. CRUD propio.
-- =============================================================================

create table habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  date         date not null,
  habit_key    text not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  unique (user_id, date, habit_key)
);

-- RLS [SPEC §C-8.2]: CRUD propio.
alter table habits enable row level security;

create policy "habits_select_own" on habits
  for select using (auth.uid() = user_id);
create policy "habits_insert_own" on habits
  for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on habits
  for update using (auth.uid() = user_id);
create policy "habits_delete_own" on habits
  for delete using (auth.uid() = user_id);
