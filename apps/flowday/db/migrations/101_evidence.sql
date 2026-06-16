-- =============================================================================
-- Migration 101_evidence  [NORMATIVO — SPEC §C-7.2]
-- Append-only (INV-11): una verificación registrada NO se reescribe. Sin políticas
-- de UPDATE/DELETE para el cliente. Guarda photo_path (ruta Storage), nunca URL pública (S4).
-- =============================================================================

create table evidence (
  id               uuid primary key default gen_random_uuid(),
  block_id         uuid not null references blocks(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  photo_path       text not null,        -- ruta en Storage (no URL pública)
  verified         boolean not null default false,
  confidence       numeric(4,3),
  verification_msg text,
  provider         text,                 -- proveedor que verificó
  usage_log_id     uuid references usage_log(id), -- enlace al consumo cobrado (trazabilidad §C-9.6)
  created_at       timestamptz not null default now()
);
create index evidence_block_idx on evidence(block_id);

-- RLS [SPEC §C-8.2 + INV-11]: lectura propia + inserción propia. SIN update/delete (append-only).
alter table evidence enable row level security;

create policy "evidence_select_own" on evidence
  for select using (auth.uid() = user_id);
create policy "evidence_insert_own" on evidence
  for insert with check (auth.uid() = user_id);
-- (Sin UPDATE/DELETE: historial inmutable. El borrado por retención lo hace cleanup vía service_role.)
