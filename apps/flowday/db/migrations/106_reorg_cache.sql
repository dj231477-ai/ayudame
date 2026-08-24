-- =============================================================================
-- Migration 106_reorg_cache  [NORMATIVO — SPEC §C-26.3]
-- Backfill (2026-08-24): esta migración se aplicó directamente contra Supabase el
-- 2026-06-22 (auto-organización de Calendar/Tasks, §C-26) pero el archivo nunca se
-- comiteó al repo — gap descubierto al reconciliar con origin/master. Reconstruida
-- fielmente desde el esquema real vía information_schema/pg_policies (columnas,
-- constraints y las 3 políticas RLS coinciden exactamente con lo ya vivo en producción).
--
-- Cache de reorganización de Calendar/Tasks con invalidación por hash. Derivada y
-- desechable: puede regenerarse en cualquier momento a partir de las fuentes reales
-- (Calendar/Tasks + blocks del día). Si el hash no cambió desde la última corrida,
-- no se gasta IA (§C-26.3/§C-26.4).
-- =============================================================================

create table reorg_cache (
  user_id      uuid not null references profiles(id) on delete cascade,
  date         date not null,
  source_hash  text not null,
  plan         jsonb not null,
  computed_at  timestamptz not null default now(),
  primary key (user_id, date)
);

alter table reorg_cache enable row level security;

create policy "reorg_cache_select_own" on reorg_cache
  for select using (auth.uid() = user_id);

create policy "reorg_cache_insert_own" on reorg_cache
  for insert with check (auth.uid() = user_id);

create policy "reorg_cache_update_own" on reorg_cache
  for update using (auth.uid() = user_id);
