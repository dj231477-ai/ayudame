'use client';
import { useState } from 'react';
import { Button } from '@flowday/ui';
import { apiFetch, ApiError } from '@/lib/api/client';

// GDPR (§C-15.4): exportar y borrar cuenta.
export function AccountClient() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/v1/account/delete', { method: 'POST' });
      window.location.href = '/';
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 pt-4">
      <p className="font-medium">Tus datos</p>
      <a href="/api/v1/account/export" className="inline-block text-sm text-deep underline">
        Exportar mis datos (JSON)
      </a>
      <div>
        {!confirming ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Borrar mi cuenta
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-600">
              Esto borra tu cuenta y todos tus datos. No se puede deshacer.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" disabled={busy} onClick={() => void del()}>
                {busy ? 'Borrando…' : 'Confirmar borrado'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
