-- =============================================================================
-- Migration 003_credit_purchases  [NORMATIVO — SPEC §C-7.1]
-- Compras de paquetes de créditos. Lo escribe el webhook de Stripe (service_role,
-- §C-12.4). El cliente solo lee sus compras.
-- =============================================================================

create table credit_purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  package            text not null,             -- 'starter' | 'growth' | 'power'
  amount_usd         numeric(10,2) not null,    -- lo que pagó
  credits_added      numeric(12,6) not null,    -- saldo acreditado (USD)
  stripe_payment_id  text unique,
  status             text not null default 'pending', -- 'pending' | 'completed' | 'refunded'
  created_at         timestamptz not null default now()
);

-- RLS [SPEC §C-8.2]: solo lectura propia; escrituras vía webhook service_role.
alter table credit_purchases enable row level security;

create policy "credit_purchases_select_own" on credit_purchases
  for select using (auth.uid() = user_id);
