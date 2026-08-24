-- =============================================================================
-- Migration 012_refund_credits_optional_log  [§C-9.6 — tipo correcto]
-- refund_credits puede invocarse SIN usage_log_id: ocurre cuando el cobro se revierte
-- antes de existir una fila usage_log (p. ej. el insert de usage_log falló tras deducir,
-- §C-9.5/§C-9.6). El parámetro pasa a tener DEFAULT NULL para poder omitirse, y la
-- actualización de usage_log se hace solo si hay id. Así el tipo generado lo marca
-- opcional y no se pasa `null` literal (corrige el error de typecheck).
-- =============================================================================

create or replace function refund_credits(p_user_id uuid, p_amount numeric, p_usage_log_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update credits
     set balance = balance + p_amount,
         total_spent = total_spent - p_amount,
         updated_at = now()
   where user_id = p_user_id;
  if p_usage_log_id is not null then
    update usage_log set refunded = true where id = p_usage_log_id;
  end if;
end $$;

-- Grants [§C-7.4] (idempotente; la firma de tipos no cambia, pero se reafirma).
revoke all on function refund_credits(uuid, numeric, uuid) from public;
grant execute on function refund_credits(uuid, numeric, uuid) to service_role;
