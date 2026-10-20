/*
 * Service worker de City Ville : affiche les notifications Web Push envoyées
 * par le serveur (« vos fraises sont prêtes ! »), même quand le jeu est fermé,
 * et rouvre le jeu quand on touche une notification.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'City Ville', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => 'focus' in client);
      if (open) return open.focus();
      return self.clients.openWindow('./');
    })(),
  );
});
