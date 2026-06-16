'use client';
import { useState } from 'react';
import { Button, Card, ErrorCard, EmptyState } from '@flowday/ui';
import { apiFetch, ApiError } from '@/lib/api/client';

interface Entry {
  user_id: string;
  name: string | null;
  streak: number;
}
interface Challenge {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  owner_id: string;
  leaderboard: Entry[];
}

export function ChallengesClient({ initial }: { initial: Challenge[] }) {
  const [challenges, setChallenges] = useState<Challenge[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const data = await apiFetch<{ challenges: Challenge[] }>('/api/v1/challenges');
      setChallenges(data.challenges);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }

  async function create(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/v1/challenges', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name')),
          start_date: String(form.get('start_date')),
          end_date: String(form.get('end_date')),
        }),
      });
      await reload();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorCard message={error} onRetry={reload} /> : null}

      <form action={create} className="grid grid-cols-2 gap-2">
        <input name="name" required placeholder="Nombre del reto" className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        <input name="start_date" type="date" required className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        <input name="end_date" type="date" required className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        <Button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear reto'}</Button>
      </form>

      {challenges.length === 0 ? (
        <EmptyState title="Sin retos" description="Crea uno e invita a tu accountability partner." />
      ) : (
        <ul className="space-y-3">
          {challenges.map((c) => (
            <li key={c.id}>
              <Card>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-neutral-500">{c.start_date} → {c.end_date}</p>
                <ol className="mt-2 space-y-1">
                  {c.leaderboard.map((e, i) => (
                    <li key={e.user_id} className="flex justify-between text-sm">
                      <span>{i + 1}. {e.name ?? 'Usuario'}</span>
                      <span className="font-semibold">{e.streak} 🔥</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-neutral-400">ID para invitar: {c.id}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
