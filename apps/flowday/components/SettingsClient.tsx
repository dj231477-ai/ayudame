'use client';
import { Button } from '@flowday/ui';
import { usePush } from '@/hooks/usePush';

const LABEL: Record<string, string> = {
  idle: 'Activar notificaciones',
  subscribing: 'Activando…',
  subscribed: 'Activadas ✓',
  denied: 'Permiso denegado',
  unsupported: 'No soportado en este navegador',
  error: 'Error, reintenta',
};

export function SettingsClient() {
  const { status, subscribe } = usePush();
  return (
    <section className="space-y-2">
      <p className="font-medium">Notificaciones</p>
      <p className="text-sm text-neutral-500">
        Recibe avisos de inicio/fin de bloque y recordatorios de foto.
      </p>
      <Button
        onClick={() => void subscribe()}
        disabled={status === 'subscribing' || status === 'subscribed'}
      >
        {LABEL[status] ?? 'Activar notificaciones'}
      </Button>

      <div className="pt-4">
        <p className="font-medium">Google Tasks</p>
        <p className="mb-2 text-sm text-neutral-500">
          Conecta para ver tus tareas y recibirlas en el briefing matutino.
        </p>
        <a
          href="/api/v1/google/connect"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-200 px-4 py-2 text-base font-medium text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100"
        >
          Conectar Google Tasks
        </a>
      </div>
    </section>
  );
}
