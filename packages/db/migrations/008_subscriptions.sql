-- =============================================================================
-- Migration 008_subscriptions  [NORMATIVO — SPEC §C-7.1]
-- Estado de suscripción de plan. Autoridad = Stripe (§C-9.1, §C-12.4). Escrito por
-- el webhook de Stripe (service_role). El cliente solo lee su suscripción.
-- =============================================================================

create table subscriptions (
  user_id                uuid primary key references profiles(id) on delete cascade,
  plan                   text not null default 'free',   -- 'free' | 'pro' | 'team'
  status                 text not null default 'active',  -- 'active' | 'past_due' | 'canceled' | 'trialing'
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  seats                  integer not null default 1,      -- para Team
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- RLS [SPEC §C-8.2]: solo lectura propia; escrituras vía webhook service_role.
alter table subscriptions enable row level security;

create policy "subscriptions_select_own" on subscriptions
  for select using (auth.uid() = user_id);
