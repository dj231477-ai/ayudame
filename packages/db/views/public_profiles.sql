-- =============================================================================
-- View public_profiles  [NORMATIVO — SPEC §C-8.4] (resuelve S6)
-- RLS no filtra columnas; el perfil público se expone con una vista de SOLO columnas
-- públicas. profiles permanece privado. plan/timezone/locale/id JAMÁS se exponen.
-- La página u/[handle] consume esta vista, nunca profiles (§C-13.7).
-- =============================================================================

-- security_invoker=false (por defecto en vistas no-RLS) NO sirve aquí: queremos que la
-- vista exponga solo estas columnas a anon/authenticated. Se crea la vista y se otorga SELECT.
create or replace view public_profiles as
  select handle, full_name, streak
  from profiles
  where handle is not null;

-- La vista hereda los permisos de su creador para leer profiles; otorgamos SELECT sobre la
-- vista a los roles públicos (no sobre profiles).
grant select on public_profiles to anon, authenticated;
