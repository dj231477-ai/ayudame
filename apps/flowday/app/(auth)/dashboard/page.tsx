import { redirect } from 'next/navigation';
import { Card, CreditBalance } from '@flowday/ui';
import { usdToCredits } from '@flowday/core/credits/pricing';
import { createClient } from '@/lib/supabase/server';
import { localDate } from '@/lib/datetime';
import { DayBoard } from '@/components/blocks/DayBoard';
import type { Block } from '@/lib/types';

// Dashboard: saldo + racha + tablero del día (ciclo completo del bloque, DoD Fase 1 §C-22).
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, streak, plan, timezone')
    .eq('id', user.id)
    .single();
  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const tz = profile?.timezone ?? 'America/Bogota';
  const today = localDate(new Date(), tz); // INV-12: fecha en tz del usuario

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id,date,start_time,end_time,label,type,task_id,status')
    .eq('user_id', user.id)
    .eq('date', today)
    .order('start_time', { ascending: true });

  const balanceUsd = credits?.balance ?? 0;

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Hola{profile?.full_name ? `, ${profile.full_name}` : ''}
          </h1>
          <p className="text-sm text-neutral-500">
            Plan {profile?.plan ?? 'free'} · {today}
          </p>
        </div>
        <nav className="flex flex-wrap justify-end gap-3 text-sm text-neutral-500 underline">
          <a href="/history">Historial</a>
          <a href="/analytics">Analytics</a>
          <a href="/challenges">Retos</a>
          <a href="/settings">Ajustes</a>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <Card>
          <CreditBalance credits={usdToCredits(balanceUsd)} balanceUsd={balanceUsd} />
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Racha</p>
          <p className="mt-1 text-2xl font-bold">{profile?.streak ?? 0}</p>
          <p className="text-xs text-neutral-500">días</p>
        </Card>
      </section>

      <DayBoard userId={user.id} date={today} initialBlocks={(blocks ?? []) as Block[]} />
    </main>
  );
}
