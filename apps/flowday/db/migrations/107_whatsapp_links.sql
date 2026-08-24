-- =============================================================================
-- Migration 107_whatsapp_links  [NORMATIVO — SPEC §C-7.2, §C-13.10]
-- Numerada 107, no 106: 106 ya lo ocupaba reorg_cache (§C-26.3), aplicado directo a
-- producción el 2026-06-22 sin archivo en el repo hasta el backfill de 106_reorg_cache.sql.
-- Vínculo teléfono de WhatsApp -> usuario. El usuario genera un código de 6
-- dígitos desde Ajustes y lo envía por WhatsApp para confirmar el vínculo
-- (evita que cualquiera reclame un número ajeno). INSERT/UPDATE solo vía
-- service_role: el cliente nunca escribe phone_e164 directo.
-- =============================================================================

create table whatsapp_links (
  user_id            uuid primary key references profiles(id) on delete cascade,
  phone_e164         text unique,             -- null hasta confirmar el vínculo
  link_code          text,                    -- código de 6 dígitos pendiente
  link_code_expires  timestamptz,
  linked_at          timestamptz,
  created_at         timestamptz not null default now()
);
create index whatsapp_links_phone_idx on whatsapp_links(phone_e164);

alter table whatsapp_links enable row level security;

create policy "whatsapp_links_select_own" on whatsapp_links
  for select using (auth.uid() = user_id);

-- Sin política de insert/update para el cliente: se confirma vía el webhook
-- de WhatsApp (service_role), no directo. El código de enlace no es un dato
-- sensible por sí mismo, pero el vínculo del teléfono sí requiere prueba de
-- posesión del número (INV-1: no se puede reclamar un teléfono ajeno).
