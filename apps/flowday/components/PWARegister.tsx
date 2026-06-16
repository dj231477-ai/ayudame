'use client';
import { useEffect } from 'react';

// Registra el Service Worker (PWA instalable + push). SPEC §C-1.
export function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registro fallido: la app sigue funcionando sin PWA/push.
      });
    }
  }, []);
  return null;
}
