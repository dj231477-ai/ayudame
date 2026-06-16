import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignInButton } from '@/components/SignInButton';

// Landing pública. SPEC §C-13.1 paso 1.
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium text-deep">FlowDay</p>
        <h1 className="text-3xl font-bold leading-tight">
          Demuestra tu progreso, no solo lo planees.
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Organiza tu día en bloques. Al terminar cada uno, una IA verifica tu foto de evidencia.
          Tu historial es la prueba.
        </p>
      </header>

      <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
        <li>• Bloques de tiempo con timers precisos</li>
        <li>• Accountability por foto verificada con IA</li>
        <li>• Rachas y progreso compartible</li>
      </ul>

      <div>
        <SignInButton />
        <p className="mt-3 text-xs text-neutral-500">
          Recibes saldo inicial gratis para tus primeras verificaciones.
        </p>
      </div>
    </main>
  );
}
