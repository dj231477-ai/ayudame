-- =============================================================================
-- Migration 010_rpc_functions  [NORMATIVO — SPEC §C-7.4]
-- Funciones RPC + grants + trigger de alta de usuario.
-- Nota de seguridad (§C-7.4): toda función security definer fija search_path y
-- restringe ejecución a service_role (revoke from public; grant to service_role).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- F1: descuento atómico de créditos. Falla si saldo insuficiente (INV-2).
-- ---------------------------------------------------------------------------
create or replace function deduct_credits(p_user_id uuid, p_amount numeric)
returns numeric                       -- retorna saldo resultante
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_balance numeric;
begin
  update credits
     set balance = balance - p_amount,
         total_spent = total_spent + p_amount,
         updated_at = now()
   where user_id = p_user_id and balance >= p_amount
   returning balance into new_balance;
  if new_balance is null then
    raise exception 'insufficient_credits';
  end if;
  return new_balance;
end $$;

-- ---------------------------------------------------------------------------
-- Reembolso de créditos (fallo del sistema; §C-9.6).
-- ---------------------------------------------------------------------------
create or replace function refund_credits(p_user_id uuid, p_amount numeric, p_usage_log_id uuid)
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
  update usage_log set refunded = true where id = p_usage_log_id;
end $$;

-- ---------------------------------------------------------------------------
-- Acreditar compra de créditos (desde webhook Stripe; idempotencia por caller, §C-12.4).
-- ---------------------------------------------------------------------------
create or replace function add_credits(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into credits (user_id, balance, total_purchased)
  values (p_user_id, p_amount, p_amount)
  on conflict (user_id) do update
    set balance = credits.balance + p_amount,
        total_purchased = credits.total_purchased + p_amount,
        updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Stipend de alta (§C-13.1 paso 4) — idempotente (INV-6).
-- Acredita el stipend inicial UNA sola vez (cuando la cuenta nunca ha recibido nada).
-- El monto viene de @flowday/core/credits/pricing.ts STIPENDS (INV-3, fuente única).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- F2: incremento atómico de uso de IA por proveedor/día (E4, §C-10.4).
-- ---------------------------------------------------------------------------
create or replace function increment_ai_usage(p_provider text, p_tokens bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into ai_daily_usage (provider, date, request_count, token_count)
  values (p_provider, current_date, 1, p_tokens)
  on conflict (provider, date) do update
    set request_count = ai_daily_usage.request_count + 1,
        token_count   = ai_daily_usage.token_count + p_tokens;
end $$;

-- ---------------------------------------------------------------------------
-- F3: métricas de plataforma para monetización (§C-9.7, §C-20.1).
-- ---------------------------------------------------------------------------
create or replace function get_platform_metrics()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_users',                 (select count(*) from profiles),
    'monthly_active_users',        (select count(distinct user_id) from usage_log
                                      where created_at > now() - interval '30 days'),
    'monthly_photo_verifications', (select count(*) from usage_log
                                      where action='photo_verify'
                                        and created_at > now() - interval '30 days'),
    'monthly_cost_usd',            (select coalesce(sum(cost_real),0) from usage_log
                                      where created_at > now() - interval '30 days')
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger de alta de usuario (§C-13.1 pasos 3–4; decisión D-4: trigger crea filas).
-- Crea profiles + fila credits vacía. El STIPEND lo acredita el backend de onboarding
-- vía grant_signup_stipend (INV-3: el monto vive en pricing.ts, no en SQL).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants [NORMATIVO — §C-7.4]: ejecución solo por service_role; nunca anon/authenticated.
-- handle_new_user es invocado por el trigger (definer); no requiere grant a roles cliente.
-- ---------------------------------------------------------------------------
revoke all on function deduct_credits(uuid, numeric) from public;
revoke all on function refund_credits(uuid, numeric, uuid) from public;
revoke all on function add_credits(uuid, numeric) from public;
revoke all on function grant_signup_stipend(uuid, numeric) from public;
revoke all on function increment_ai_usage(text, bigint) from public;
revoke all on function get_platform_metrics() from public;

grant execute on function deduct_credits(uuid, numeric) to service_role;
grant execute on function refund_credits(uuid, numeric, uuid) to service_role;
grant execute on function add_credits(uuid, numeric) to service_role;
grant execute on function grant_signup_stipend(uuid, numeric) to service_role;
grant execute on function increment_ai_usage(text, bigint) to service_role;
grant execute on function get_platform_metrics() to service_role;
