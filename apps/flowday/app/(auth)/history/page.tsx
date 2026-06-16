import { redirect } from 'next/navigation';
import { Card, EmptyState } from '@flowday/ui';
import { createClient } from '@/lib/supabase/server';

// Historial de evidencia (append-only, INV-11). SPEC §C-13.
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: evidence } = await supabase
    .from('evidence')
    .select('id, verified, confidence, verification_msg, provider, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = evidence ?? [];

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historial</h1>
        <a href="/dashboard" className="text-sm text-neutral-500 underline">
          Volver
        </a>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="Aún no hay evidencia" description="Verifica tu primer bloque para verlo aquí." />
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex items-center justify-between">
                  <span className={e.verified ? 'font-medium text-green-600' : 'text-neutral-500'}>
                    {e.verified ? '✓ Verificado' : '✗ No verificado'}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                {e.verification_msg ? (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {e.verification_msg}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-neutral-400">
                  {e.provider ?? '—'}
                  {typeof e.confidence === 'number' ? ` · confianza ${e.confidence}` : ''}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
