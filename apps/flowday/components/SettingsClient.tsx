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

interface SettingsClientProps {
  googleConnected: boolean;
  whatsappPhone: string | null;
  frequentReminders: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  maxDailyTasks: number;
}

export function SettingsClient({
  googleConnected,
  whatsappPhone,
  frequentReminders,
  quietHoursStart,
  quietHoursEnd,
  maxDailyTasks,
}: SettingsClientProps) {
  const { status, subscribe } = usePush();
  const [waCode, setWaCode] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

  const [frequent, setFrequent] = useState(frequentReminders);
  const [frequentBusy, setFrequentBusy] = useState(false);
  const [frequentError, setFrequentError] = useState<string | null>(null);

  async function toggleFrequentReminders(next: boolean) {
    setFrequentError(null);
    setFrequentBusy(true);
    const previous = frequent;
    setFrequent(next); // optimista: es una preferencia de accesibilidad, no debe sentirse lenta.
    try {
      await apiFetch('/api/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify({ frequent_reminders: next }),
      });
    } catch (e) {
      setFrequent(previous);
      if (e instanceof ApiError) setFrequentError(e.message);
    } finally {
      setFrequentBusy(false);
    }
  }

  // D-12, §C-13.5c: horario de silencio personalizable — vacío = deshabilitado, nunca uno fijo.
  const [quietStart, setQuietStart] = useState(quietHoursStart ?? '');
  const [quietEnd, setQuietEnd] = useState(quietHoursEnd ?? '');
  const [quietBusy, setQuietBusy] = useState(false);
  const [quietError, setQuietError] = useState<string | null>(null);

  async function saveQuietHours(start: string, end: string) {
    setQuietError(null);
    setQuietBusy(true);
    try {
      await apiFetch('/api/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          quiet_hours_start: start || null,
          quiet_hours_end: end || null,
        }),
      });
    } catch (e) {
      if (e instanceof ApiError) setQuietError(e.message);
    } finally {
      setQuietBusy(false);
    }
  }

  // D-25, §C-26.7b: tope de tareas de Google Tasks que el planificador puede encajar en un día,
  // sin importar cuántas estén elegidas (vencidas/de hoy) — nunca "aunque haya 40, solo N".
  const [maxTasks, setMaxTasks] = useState(maxDailyTasks);
  const [maxTasksBusy, setMaxTasksBusy] = useState(false);
  const [maxTasksError, setMaxTasksError] = useState<string | null>(null);

  async function saveMaxDailyTasks(next: number) {
    setMaxTasksError(null);
    setMaxTasksBusy(true);
    const previous = maxTasks;
    setMaxTasks(next);
    try {
      await apiFetch('/api/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify({ max_daily_tasks: next }),
      });
    } catch (e) {
      setMaxTasks(previous);
      if (e instanceof ApiError) setMaxTasksError(e.message);
    } finally {
      setMaxTasksBusy(false);
    }
  }

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
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={frequent}
            disabled={frequentBusy}
            onChange={(e) => void toggleFrequentReminders(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium">Recordatorio frecuente</span>
            <span className="block text-sm text-neutral-600">
              Pensado para TDAH o memoria débil: te recuerda seguido lo que tienes que hacer —
              incluso mientras estás trabajando en un bloque, no solo al empezar o terminar.
              Desactivado por defecto.
            </span>
          </span>
        </label>
        {frequentError ? <p className="mt-1 text-sm text-red-600">{frequentError}</p> : null}
      </div>

      <div className="pt-4">
        <p className="font-medium">Horario de silencio</p>
        <p className="mb-2 text-sm text-neutral-600">
          Ningún aviso automático (push ni WhatsApp) llega en este rango. Déjalo vacío para no
          tener horario de silencio.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={quietStart}
            disabled={quietBusy}
            onChange={(e) => {
              setQuietStart(e.target.value);
              void saveQuietHours(e.target.value, quietEnd);
            }}
            aria-label="Desde"
            className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-sm text-neutral-600">a</span>
          <input
            type="time"
            value={quietEnd}
            disabled={quietBusy}
            onChange={(e) => {
              setQuietEnd(e.target.value);
              void saveQuietHours(quietStart, e.target.value);
            }}
            aria-label="Hasta"
            className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {quietStart || quietEnd ? (
            <Button
              variant="ghost"
              onClick={() => {
                setQuietStart('');
                setQuietEnd('');
                void saveQuietHours('', '');
              }}
              disabled={quietBusy}
            >
              Quitar
            </Button>
          ) : null}
        </div>
        {quietError ? <p className="mt-1 text-sm text-red-600">{quietError}</p> : null}
      </div>

      <div className="pt-4">
        <p className="font-medium">Máximo de tareas por día</p>
        <p className="mb-2 text-sm text-neutral-600">
          Aunque tengas 40 tareas vencidas en Google Tasks, el planificador nunca te asigna más
          de este número en un mismo día.
        </p>
        <input
          type="number"
          min={1}
          max={20}
          value={maxTasks}
          disabled={maxTasksBusy}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isInteger(next) && next >= 1 && next <= 20) void saveMaxDailyTasks(next);
          }}
          aria-label="Máximo de tareas por día"
          className="w-20 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {maxTasksError ? <p className="mt-1 text-sm text-red-600">{maxTasksError}</p> : null}
      </div>

      <div className="pt-4">
        <p className="font-medium">Google Tasks</p>
        <p className="mb-2 text-sm text-neutral-600">
          Conecta para ver tus tareas y recibirlas en el briefing matutino.
        </p>
        {googleConnected ? (
          <p className="text-sm font-medium text-deep">Conectado ✓</p>
        ) : (
          <a
            href="/api/v1/google/connect"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-200 px-4 py-2 text-base font-medium text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100"
          >
            Conectar Google Tasks
          </a>
        )}
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
        ) : whatsappPhone ? (
          <p className="text-sm font-medium text-deep">Conectado ✓ ({whatsappPhone})</p>
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
