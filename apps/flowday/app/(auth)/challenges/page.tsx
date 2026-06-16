import { redirect } from 'next/navigation';
import { EmptyState } from '@flowday/ui';
import { createClient } from '@/lib/supabase/server';
import { listChallengesWithLeaderboard, userPlan } from '@/lib/challenges';
import { ChallengesClient } from '@/components/ChallengesClient';

// Retos / accountability partner (Team). SPEC §C-1.2 #10, §C-9.2.
export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const plan = await userPlan(supabase, user.id);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Retos</h1>
        <a href="/dashboard" className="text-sm text-neutral-500 underline">
          Volver
        </a>
      </header>

      {plan !== 'team' ? (
        <EmptyState
          title="Función Team"
          description="Los retos y el accountability partner están en el plan Team."
          action={
            <a href="/pricing" className="text-deep underline">
              Ver planes
            </a>
          }
        />
      ) : (
        <ChallengesClient initial={await listChallengesWithLeaderboard(supabase)} />
      )}
    </main>
  );
}
