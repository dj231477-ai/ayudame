// Service Worker de FlowDay (PWA + Web Push). SPEC §C-1 (PWA), AR-6 (push).
// Minimalista: instalable + manejo de push. El caché offline avanzado se amplía en fases posteriores.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Notificaciones push (§C-13.3, §C-13.5).
self.addEventListener('push', (event) => {
  let data = { title: 'FlowDay', body: '', url: '/dashboard' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload no-JSON: usa valores por defecto
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
