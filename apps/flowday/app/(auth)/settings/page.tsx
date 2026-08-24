import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isGoogleConnected } from '@/lib/google/tokens';
import { SettingsClient } from '@/components/SettingsClient';
import { AccountClient } from '@/components/AccountClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const [googleConnected, { data: waLink }, { data: profile }] = await Promise.all([
    isGoogleConnected(user.id),
    supabase.from('whatsapp_links').select('phone_e164').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('frequent_reminders').eq('id', user.id).single(),
  ]);

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <a href="/dashboard" className="text-sm text-neutral-600 underline">
          Volver
        </a>
      </header>

      <SettingsClient
        googleConnected={googleConnected}
        whatsappPhone={waLink?.phone_e164 ?? null}
        frequentReminders={profile?.frequent_reminders ?? false}
      />

      <AccountClient />

      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-red-600 underline">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
