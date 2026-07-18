/* ValveFlow Web Push service worker eklentisi.
 * VitePWA tarafından oluşturulan Workbox service worker içine import edilir.
 */

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'ValveFlow',
      body: event.data
        ? event.data.text()
        : 'Yeni bir bildiriminiz var.',
    };
  }

  const title = payload.title || 'ValveFlow';
  const targetUrl = payload.url || '/';

  const options = {
    body:
      payload.body ||
      payload.message ||
      'Yeni bir bildiriminiz var.',

    icon: payload.icon || '/pwa-icon.svg',
    badge: payload.badge || '/pwa-icon.svg',

    tag:
      payload.tag ||
      payload.notificationId ||
      'valveflow-notification',

    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),

    vibrate: [180, 80, 180],

    timestamp: payload.timestamp || Date.now(),

    data: {
      url: targetUrl,
      notificationId: payload.notificationId || null,
      relatedTable: payload.relatedTable || null,
      relatedId: payload.relatedId || null,
    },

    actions: [
      {
        action: 'open',
        title: 'ValveFlow’da Aç',
      },
      {
        action: 'dismiss',
        title: 'Kapat',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then(windowClients => {
        for (const client of windowClients) {
          if ('navigate' in client) {
            return client
              .navigate(targetUrl)
              .then(() => client.focus());
          }
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener('notificationclose', () => {
  // Bildirimin kapatılması uygulamada ek işlem gerektirmez.
});
