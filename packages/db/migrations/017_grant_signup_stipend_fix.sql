-- =============================================================================
-- Migration 017_grant_signup_stipend_fix  [NORMATIVO — SPEC §C-7.4, §C-13.1]
-- La base real (qgwgzbvfarimbgoyskkd) nunca tuvo aplicada la parte de
-- 010_rpc_functions.sql que crea `grant_signup_stipend` y el trigger de alta de
-- usuario `on_auth_user_created` (handle_new_user). Sin esto, los usuarios nuevos
-- no recibían profiles/credits ni el stipend de alta — descubierto al regenerar
-- supabase/types.ts (2026-06-22) y verificado contra pg_proc/pg_trigger.
-- Contenido idéntico al de 010_rpc_functions.sql; aplicado aquí como fix idempotente
-- (create or replace / drop+create trigger) para no reordenar migraciones ya aplicadas.
--
-- Numerada 017, no 013: se escribió cuando 012 era la última compartida, pero para cuando
-- se reconcilió con origin/master ya estaban publicadas 013_frequent_reminders (D-11),
-- 014_quiet_hours (D-12), 015_max_daily_tasks (D-25) y 016_auto_organize_tasks (D-26).
-- INV-9: una migración publicada no se edita ni se reordena — se renumera la nueva.
-- Mismo patrón de drift entre lo committeado y lo vivo que D-18/D-19 (§C-7.2) y D-22.
-- =============================================================================

create or replace function grant_signup_stipend(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_balance numeric;
begin
  update credits
     set balance = balance + p_amount,
         total_purchased = total_purchased + p_amount,
         updated_at = now()
   where user_id = p_user_id and total_purchased = 0
   returning balance into new_balance;
  -- Si ya tenía stipend/compras (total_purchased > 0), no-op; devuelve saldo actual.
  return coalesce(new_balance, (select balance from credits where user_id = p_user_id));
end $$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  insert into public.credits (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

revoke all on function grant_signup_stipend(uuid, numeric) from public;
grant execute on function grant_signup_stipend(uuid, numeric) to service_role;
