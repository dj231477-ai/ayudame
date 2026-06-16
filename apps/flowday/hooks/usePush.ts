'use client';
import { useCallback, useState } from 'react';

// Suscripción Web Push (§C-13.1 paso 5). Degrada si el navegador no soporta push.
export type PushStatus =
  | 'idle'
  | 'subscribing'
  | 'subscribed'
  | 'denied'
  | 'unsupported'
  | 'error';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // Respaldado por ArrayBuffer (no ArrayBufferLike) para satisfacer BufferSource (TS 5.7+).
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('idle');

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setStatus('error');
      return;
    }
    setStatus('subscribing');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await fetch('/api/v1/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setStatus('subscribed');
    } catch {
      setStatus('error');
    }
  }, []);

  return { status, subscribe };
}
