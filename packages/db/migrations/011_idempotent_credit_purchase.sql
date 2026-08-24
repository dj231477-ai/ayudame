-- =============================================================================
-- Migration 011_idempotent_credit_purchase  [§C-12.4, INV-6 — corrige doble crédito]
-- Acreditación de compra ATÓMICA e IDEMPOTENTE por stripe_payment_id.
--
-- Causa raíz del bug: el webhook hacía add_credits (incrementa saldo) y LUEGO
-- insertaba credit_purchases en pasos separados. Si el insert fallaba, processOnce
-- liberaba el claim y Stripe reintentaba el mismo evento => add_credits corría de nuevo
-- => crédito duplicado. La entrega de webhooks es "at-least-once": el efecto debe ser
-- idempotente, no depender solo del claim.
--
-- Solución: en UNA sola transacción (una llamada a función = una transacción implícita)
-- insertar credit_purchases con ON CONFLICT (stripe_payment_id) DO NOTHING y acreditar
-- el saldo SOLO si la fila se insertó (primera vez). Reprocesar el mismo pago => no-op.
-- =============================================================================

create or replace function record_credit_purchase(
  p_user_id           uuid,
  p_package           text,
  p_amount_usd        numeric,
  p_credits           numeric,
  p_stripe_payment_id text
)
returns boolean   -- true si acreditó (primera vez); false si ya estaba registrado (no-op)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows int;
begin
  -- La clave de idempotencia debe ser no nula: con NULL, UNIQUE no detecta duplicados
  -- (NULL es distinto de NULL en SQL) y reintentos podrían duplicar el saldo.
  if p_stripe_payment_id is null then
    raise exception 'record_credit_purchase requires a non-null idempotency key';
  end if;

  insert into credit_purchases (user_id, package, amount_usd, credits_added, stripe_payment_id, status)
  values (p_user_id, p_package, p_amount_usd, p_credits, p_stripe_payment_id, 'completed')
  on conflict (stripe_payment_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false; -- duplicado: este pago ya se acreditó
  end if;

  insert into credits (user_id, balance, total_purchased)
  values (p_user_id, p_credits, p_credits)
  on conflict (user_id) do update
    set balance = credits.balance + p_credits,
        total_purchased = credits.total_purchased + p_credits,
        updated_at = now();
  return true;
end $$;

-- Grants [§C-7.4]: solo service_role (lo llama el webhook de Stripe en el backend).
revoke all on function record_credit_purchase(uuid, text, numeric, numeric, text) from public;
grant execute on function record_credit_purchase(uuid, text, numeric, numeric, text) to service_role;
