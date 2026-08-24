import 'server-only';
import { getStripe, type Stripe } from '@flowday/core/billing/stripe';
import { CREDIT_PACKAGES, STIPENDS, type CreditPackageKey } from '@flowday/core/credits/pricing';
import { createServiceClient } from '@/lib/supabase/service';

// Orquestación Stripe (price IDs específicos de la app, §C-24.2). SPEC §C-9.8, §C-11.4, §C-12.4.

type CheckoutKind = 'package' | 'subscription';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function priceIdFor(kind: CheckoutKind, id: string): string {
  const map: Record<string, string | undefined> = {
    'package:starter': process.env.STRIPE_PRICE_ID_STARTER,
    'package:growth': process.env.STRIPE_PRICE_ID_GROWTH,
    'package:power': process.env.STRIPE_PRICE_ID_POWER,
    'subscription:pro': process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    'subscription:team': process.env.STRIPE_PRICE_ID_TEAM,
  };
  const priceId = map[`${kind}:${id}`];
  if (!priceId) throw new Error(`stripe_price_not_configured_${kind}_${id}`);
  return priceId;
}

export async function createCheckout(params: {
  kind: CheckoutKind;
  id: string;
  seats?: number;
  userId: string;
  email?: string | undefined;
  idempotencyKey?: string | undefined;
}): Promise<string> {
  const stripe = getStripe();
  const priceId = priceIdFor(params.kind, params.id);
  const base = appUrl();
  const opts = params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined;

  const common = {
    automatic_tax: { enabled: true }, // Stripe Tax: IVA 19% CO / 0% intl (§C-21.3/§C-21.5)
    success_url: `${base}/dashboard?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancel`,
    ...(params.email ? { customer_email: params.email } : {}),
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>;

  let session: Stripe.Checkout.Session;
  if (params.kind === 'package') {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { user_id: params.userId, kind: 'package', package: params.id },
        ...common,
      },
      opts,
    );
  } else {
    const plan = params.id; // 'pro' | 'team'
    const quantity = plan === 'team' ? Math.max(3, params.seats ?? 3) : 1;
    session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity }],
        metadata: { user_id: params.userId, kind: 'subscription', plan, seats: String(quantity) },
        subscription_data: { metadata: { user_id: params.userId, plan, seats: String(quantity) } },
        ...common,
      },
      opts,
    );
  }
  if (!session.url) throw new Error('stripe_no_session_url');
  return session.url;
}

export async function createPortal(userId: string): Promise<string> {
  const stripe = getStripe();
  const svc = createServiceClient();
  const { data: sub } = await svc
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!sub?.stripe_customer_id) throw new Error('no_stripe_customer');
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl()}/settings`,
  });
  return portal.url;
}

function mapStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' | 'trialing' {
  if (s === 'trialing') return 'trialing';
  if (s === 'past_due') return 'past_due';
  if (s === 'active') return 'active';
  return 'canceled';
}

/** Stipend mensual del plan (§C-9.2): Pro $1.00; Team $2.00 por asiento; Free 0 (su stipend es de alta). */
function stipendFor(plan: string, seats: number): number {
  if (plan === 'team') return STIPENDS.team * Math.max(1, seats);
  if (plan === 'pro') return STIPENDS.pro;
  return 0;
}

/** Aplica los efectos de un evento Stripe verificado (§C-12.4). Idempotencia la garantiza el caller. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const svc = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const userId = s.metadata?.user_id;
      if (!userId) return;

      if (s.metadata?.kind === 'package') {
        const pkg = s.metadata.package as CreditPackageKey;
        const creditsUsd = CREDIT_PACKAGES[pkg]?.credits_usd;
        if (creditsUsd == null) return;
        // Acreditación atómica e idempotente por stripe_payment_id (INV-6): un reintento
        // de Stripe tras fallo parcial NO duplica el saldo. Clave garantizada no nula
        // (payment_intent o, en su defecto, el id de la sesión).
        const paymentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.id;
        await svc.rpc('record_credit_purchase', {
          p_user_id: userId,
          p_package: pkg,
          p_amount_usd: (s.amount_total ?? 0) / 100,
          p_credits: creditsUsd,
          p_stripe_payment_id: paymentId,
        });
      } else if (s.metadata?.kind === 'subscription') {
        const plan = s.metadata.plan ?? 'pro';
        const seats = Math.max(1, Number.parseInt(s.metadata.seats ?? '1', 10) || 1);
        await svc.from('subscriptions').upsert(
          {
            user_id: userId,
            plan,
            status: 'active',
            stripe_customer_id: typeof s.customer === 'string' ? s.customer : null,
            stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : null,
            seats,
          },
          { onConflict: 'user_id' },
        );
        await svc.from('profiles').update({ plan }).eq('id', userId);
        // Stipend INICIAL del plan (§C-9.2). Última operación del branch: con la dedupe por
        // event_id de processOnce no se duplica, y no se solapa con invoice.payment_succeeded
        // (que solo acredita renovaciones, billing_reason 'subscription_cycle').
        const stipend = stipendFor(plan, seats);
        if (stipend > 0) await svc.rpc('add_credits', { p_user_id: userId, p_amount: stipend });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await svc
        .from('subscriptions')
        .update({
          status: mapStatus(sub.status),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        })
        .eq('user_id', userId);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      await svc.from('subscriptions').update({ status: 'canceled' }).eq('user_id', userId);
      await svc.from('profiles').update({ plan: 'free' }).eq('id', userId);
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (pi) {
        await svc.from('credit_purchases').update({ status: 'refunded' }).eq('stripe_payment_id', pi);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const inv = event.data.object;
      // Solo renovaciones: el alta inicial ya acreditó el stipend en checkout.session.completed.
      if (inv.billing_reason !== 'subscription_cycle') break;
      const subId =
        typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription?.id ?? null);
      if (!subId) break;
      const { data: sub } = await svc
        .from('subscriptions')
        .select('user_id, plan, seats')
        .eq('stripe_subscription_id', subId)
        .maybeSingle();
      if (!sub) break;
      const stipend = stipendFor(sub.plan, sub.seats ?? 1);
      if (stipend > 0) await svc.rpc('add_credits', { p_user_id: sub.user_id, p_amount: stipend });
      break;
    }
    default:
      break;
  }
}
