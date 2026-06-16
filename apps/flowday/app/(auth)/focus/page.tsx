import { redirect } from 'next/navigation';
import { EmptyState } from '@flowday/ui';
import { createClient } from '@/lib/supabase/server';
import { localDate } from '@/lib/datetime';
import { DayBoard } from '@/components/blocks/DayBoard';
import type { Block } from '@/lib/types';

// Modo foco: solo los bloques que requieren tu atención ahora (active / awaiting_photo). §C-13.3.
export const dynamic = 'force-dynamic';

export default async function FocusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  const tz = profile?.timezone ?? 'America/Bogota';
  const today = localDate(new Date(), tz);

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id,date,start_time,end_time,label,type,task_id,status')
    .eq('user_id', user.id)
    .eq('date', today)
    .in('status', ['active', 'awaiting_photo'])
    .order('start_time', { ascending: true });

  const focus = (blocks ?? []) as Block[];

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Modo foco</h1>
        <a href="/dashboard" className="text-sm text-neutral-500 underline">
          Volver
        </a>
      </header>

      {focus.length === 0 ? (
        <EmptyState title="Nada pendiente ahora" description="Inicia un bloque desde el dashboard." />
      ) : (
        <DayBoard userId={user.id} date={today} initialBlocks={focus} />
      )}
    </main>
  );
}
