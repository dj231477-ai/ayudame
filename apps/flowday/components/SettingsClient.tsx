'use client';
import { useState } from 'react';
import { Button } from '@flowday/ui';
import { usePush } from '@/hooks/usePush';
import { apiFetch, ApiError } from '@/lib/api/client';

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
  const [waCode, setWaCode] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

  async function connectWhatsApp() {
    setWaBusy(true);
    setWaError(null);
    try {
      const res = await apiFetch<{ code: string }>('/api/v1/whatsapp/link-code', { method: 'POST' });
      setWaCode(res.code);
    } catch (e) {
      if (e instanceof ApiError) setWaError(e.message);
    } finally {
      setWaBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <p className="font-medium">Notificaciones</p>
      <p className="text-sm text-neutral-600">
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
        <p className="mb-2 text-sm text-neutral-600">
          Conecta para ver tus tareas y recibirlas en el briefing matutino.
        </p>
        <a
          href="/api/v1/google/connect"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-200 px-4 py-2 text-base font-medium text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100"
        >
          Conectar Google Tasks
        </a>
      </div>

      <div className="pt-4">
        <p className="font-medium">WhatsApp</p>
        <p className="mb-2 text-sm text-neutral-600">
          Canal adicional: manda tu foto de evidencia o escribe &quot;saldo&quot;/&quot;racha&quot;/&quot;saltar&quot; sin abrir la app.
        </p>
        {waCode ? (
          <p className="text-sm">
            Envía <strong>LINK {waCode}</strong> por WhatsApp a {whatsappNumber || 'nuestro número'} para confirmar.
          </p>
        ) : (
          <Button variant="secondary" onClick={() => void connectWhatsApp()} disabled={waBusy}>
            {waBusy ? 'Generando código…' : 'Conectar WhatsApp'}
          </Button>
        )}
        {waError ? <p className="mt-1 text-sm text-red-600">{waError}</p> : null}
      </div>
    </section>
  );
}
