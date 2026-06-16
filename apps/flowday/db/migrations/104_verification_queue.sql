-- =============================================================================
-- Migration 104_verification_queue  [SPEC §C-14.3 — decisión D-2: cola en DB]
-- Cuando la visión está agotada (ai_vision_exhausted), verify-photo NO cobra y encola
-- la foto aquí para reproceso cuando vuelva la cuota (cron/n8n o reintento). INV-6: el
-- reproceso es idempotente por block (un bloque verificado no se reabre).
-- Añadida por la regla R2 tras aprobar D-2; trazable a §C-14.3.
-- =============================================================================

create table verification_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  block_id      uuid not null references blocks(id) on delete cascade,
  photo_path    text not null,
  status        text not null default 'pending', -- 'pending' | 'processing' | 'done' | 'failed'
  attempts      integer not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index verification_queue_status_idx on verification_queue(status, created_at);
create index verification_queue_block_idx on verification_queue(block_id);

-- RLS [SPEC §C-8.2]: el usuario LEE el estado de su cola (la UI muestra "pendiente de
-- verificación"); las escrituras/reprocesos los hace el backend con service_role.
alter table verification_queue enable row level security;

create policy "verification_queue_select_own" on verification_queue
  for select using (auth.uid() = user_id);
