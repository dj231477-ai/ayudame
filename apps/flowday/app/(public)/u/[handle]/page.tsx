import { notFound } from 'next/navigation';
import { Card } from '@flowday/ui';
import { createClient } from '@/lib/supabase/server';

// Perfil público (solo lectura) desde la vista public_profiles (§C-8.4, §C-13.7).
// Nunca consulta `profiles`; solo handle/full_name/streak.
export const dynamic = 'force-dynamic';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('public_profiles')
    .select('handle, full_name, streak')
    .eq('handle', handle)
    .maybeSingle();

  if (!profile) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <Card>
        <p className="text-sm text-neutral-500">@{profile.handle}</p>
        <h1 className="mt-1 text-2xl font-bold">{profile.full_name ?? 'FlowDay user'}</h1>
        <div className="mt-4">
          <p className="text-4xl font-bold">{profile.streak ?? 0}</p>
          <p className="text-sm text-neutral-500">días de racha 🔥</p>
        </div>
      </Card>
      <a href="/" className="text-center text-sm text-deep underline">
        Crea tu propio FlowDay
      </a>
    </main>
  );
}
