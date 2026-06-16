import { redirect } from 'next/navigation';
import { Card, EmptyState } from '@flowday/ui';
import { createClient } from '@/lib/supabase/server';
import { computeAnalytics } from '@/lib/analytics';

// Analytics personal (Pro+). SPEC §C-1.2 #11, §C-9.2 (feature de plan).
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
  const plan = profile?.plan ?? 'free';

  if (plan === 'free') {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <EmptyState
          title="Función Pro"
          description="Las analíticas están disponibles en Pro y Team."
          action={
            <a href="/pricing" className="text-deep underline">
              Ver planes
            </a>
          }
        />
      </main>
    );
  }

  const a = await computeAnalytics(supabase, user.id);
  const maxHour = Math.max(1, ...a.byHour);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <a href="/dashboard" className="text-sm text-neutral-500 underline">
          Volver
        </a>
      </header>
      <p className="text-xs text-neutral-500">Últimos {a.rangeDays} días</p>

      <section className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase text-neutral-500">Verificación</p>
          <p className="mt-1 text-2xl font-bold">{Math.round(a.verificationRate * 100)}%</p>
          <p className="text-xs text-neutral-500">{a.verified} verif · {a.skipped} saltados</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">Tiempo verificado</p>
          <p className="mt-1 text-2xl font-bold">{Math.round(a.plannedVerifiedMinutes / 60)}h</p>
          <p className="text-xs text-neutral-500">planificado y verificado</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">Consumo IA</p>
          <p className="mt-1 text-2xl font-bold">${a.creditsSpentUsd.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">Bloques</p>
          <p className="mt-1 text-2xl font-bold">{a.blocksTotal}</p>
        </Card>
      </section>

      <Card>
        <p className="mb-2 text-xs uppercase text-neutral-500">Patrón de energía (verificaciones por hora UTC)</p>
        <div className="flex h-24 items-end gap-[2px]">
          {a.byHour.map((v, h) => (
            <div
              key={h}
              className="flex-1 rounded-t bg-deep"
              style={{ height: `${(v / maxHour) * 100}%` }}
              title={`${h}:00 — ${v}`}
            />
          ))}
        </div>
      </Card>
    </main>
  );
}
