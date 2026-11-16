self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    const payload = event.data?.json() ?? {};
    data = { ...payload.notification, ...payload.data };
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'comma connect', {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.id,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windowClients.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      if (client.url !== target) await client.navigate(target).catch(() => undefined);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
