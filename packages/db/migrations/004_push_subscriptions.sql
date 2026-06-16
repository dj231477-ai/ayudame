-- =============================================================================
-- Migration 004_push_subscriptions  [NORMATIVO — SPEC §C-7.1]
-- Suscripciones Web Push (VAPID). El cliente gestiona las suyas (alta/baja).
-- =============================================================================

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- RLS [SPEC §C-8.2]: CRUD propio completo (el cliente administra su suscripción).
alter table push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own" on push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on push_subscriptions
  for delete using (auth.uid() = user_id);
