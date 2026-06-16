'use client';
import { useState } from 'react';
import { Button, Card, ErrorCard } from '@flowday/ui';
import { apiFetch, ApiError } from '@/lib/api/client';

interface Pkg {
  id: string;
  price_usd: number;
  credits_usd: number;
}
interface Plans {
  pro: { monthly_usd: number; yearly_usd: number };
  team: { monthly_per_seat_usd: number; min_seats: number };
}

export function PricingClient({
  packages,
  plans,
  proActive,
  teamActive,
}: {
  packages: Pkg[];
  plans: Plans;
  proActive: boolean;
  teamActive: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(kind: 'package' | 'subscription', id: string, seats?: number) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('/api/v1/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ kind, id, ...(seats ? { seats } : {}) }),
      });
      window.location.href = url;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'unauthorized') window.location.href = '/';
        else setError(e.message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Precios</h1>
      {error ? <ErrorCard message={error} /> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Recarga de créditos
        </h2>
        {packages.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium capitalize">{p.id}</p>
                <p className="text-xs text-neutral-500">${p.credits_usd.toFixed(2)} de saldo</p>
              </div>
              <Button disabled={busy === p.id} onClick={() => checkout('package', p.id)}>
                {busy === p.id ? '…' : `$${p.price_usd}`}
              </Button>
            </div>
          </Card>
        ))}
      </section>

      {proActive || teamActive ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Planes</h2>
          {proActive ? (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Pro</p>
                  <p className="text-xs text-neutral-500">
                    ${plans.pro.monthly_usd}/mes · historial ilimitado, Calendar, analytics
                  </p>
                </div>
                <Button disabled={busy === 'pro'} onClick={() => checkout('subscription', 'pro')}>
                  {busy === 'pro' ? '…' : 'Suscribir'}
                </Button>
              </div>
            </Card>
          ) : null}
          {teamActive ? (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Team</p>
                  <p className="text-xs text-neutral-500">
                    ${plans.team.monthly_per_seat_usd}/usuario/mes (mín. {plans.team.min_seats})
                  </p>
                </div>
                <Button
                  disabled={busy === 'team'}
                  onClick={() => checkout('subscription', 'team', plans.team.min_seats)}
                >
                  {busy === 'team' ? '…' : 'Suscribir'}
                </Button>
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        Los créditos no son reembolsables salvo fallo del sistema. Precios en USD; Stripe ajusta
        impuestos y moneda local.
      </p>
    </main>
  );
}
