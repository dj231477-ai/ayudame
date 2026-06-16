-- =============================================================================
-- Migration 001_credits  [NORMATIVO — SPEC §C-7.1]
-- Saldo en USD, precisión 6 decimales. check (balance >= 0) garantiza no-negativo
-- (refuerza la atomicidad de deduct_credits, §C-14.4).
-- =============================================================================

create table credits (
  user_id         uuid primary key references profiles(id) on delete cascade,
  balance         numeric(12,6) not null default 0 check (balance >= 0),
  total_purchased numeric(12,6) not null default 0,
  total_spent     numeric(12,6) not null default 0,
  updated_at      timestamptz not null default now()
);

-- RLS [SPEC §C-8.2]: el cliente solo LEE su saldo. Las escrituras de saldo se hacen
-- exclusivamente vía RPC con service_role (deduct_credits / add_credits / refund_credits),
-- que hacen bypass de RLS. No se exponen políticas de insert/update/delete al cliente.
alter table credits enable row level security;

create policy "credits_select_own" on credits
  for select using (auth.uid() = user_id);
