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

  const [googleConnected, { data: waLink }, { data: profile }, { data: googleToken }] = await Promise.all([
    isGoogleConnected(user.id),
    supabase.from('whatsapp_links').select('phone_e164').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('profiles')
      .select('frequent_reminders, quiet_hours_start, quiet_hours_end, max_daily_tasks, auto_organize_tasks')
      .eq('id', user.id)
      .single(),
    supabase.from('google_tokens').select('scope').eq('user_id', user.id).maybeSingle(),
  ]);
  // D-26, §C-26.7c: el scope de escritura de Calendar (GOOGLE_CALENDAR_SCOPE) se pidió recién —
  // una cuenta conectada antes solo tiene el scope viejo de solo-lectura y necesita reconectar.
  const hasCalendarWriteScope = googleToken?.scope?.includes('calendar.events') ?? false;

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
        quietHoursStart={profile?.quiet_hours_start?.slice(0, 5) ?? null}
        quietHoursEnd={profile?.quiet_hours_end?.slice(0, 5) ?? null}
        maxDailyTasks={profile?.max_daily_tasks ?? 5}
        autoOrganizeTasks={profile?.auto_organize_tasks ?? false}
        hasCalendarWriteScope={hasCalendarWriteScope}
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
