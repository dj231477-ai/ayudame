-- =============================================================================
-- Migration 002_usage_log  [NORMATIVO — SPEC §C-7.1]
-- Append-only: un registro por consumo de IA. Lo inserta el backend en
-- checkAndDeductCredits (§C-9.5). El cliente solo lee su propio historial.
-- =============================================================================

create table usage_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  action       text not null,            -- 'photo_verify' | 'chat_message' | 'daily_briefing' | 'weekly_analysis' | 'embedding'
  provider     text not null,            -- 'gemini' | 'groq' | 'cerebras' | 'ollama' | 'claude'
  model        text,
  cost_real    numeric(12,6) not null,   -- lo que pagamos al proveedor (0 para ollama)
  cost_charged numeric(12,6) not null,   -- lo que se descontó al usuario
  margin       numeric(6,4) not null,
  refunded     boolean not null default false,
  metadata     jsonb,                    -- tokens, latencia, request_id, etc.
  created_at   timestamptz not null default now()
);
create index usage_log_user_created_idx on usage_log(user_id, created_at desc);

-- RLS [SPEC §C-8.2]: solo lectura propia; inserciones vía backend service_role (§C-9.5).
alter table usage_log enable row level security;

create policy "usage_log_select_own" on usage_log
  for select using (auth.uid() = user_id);
