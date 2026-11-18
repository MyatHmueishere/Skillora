/* Skillora Web Push Service Worker
 * Handles background push notifications outside the website and focuses/opens
 * the learner's active lesson or dashboard when clicked.
 * Intentionally avoids intercepting fetch events so Vite HMR and API requests stay clean.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Skillora Learning Reminder',
    body: 'Your next lesson is ready whenever you want to continue.',
    url: '/#/dashboard',
    tag: 'skillora-reminder',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: {},
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          ...payload,
          ...parsed,
        };
      }
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/favicon.png',
    badge: payload.badge || '/favicon.png',
    tag: payload.tag || 'skillora-reminder',
    renotify: false,
    data: {
      url: payload.url || '/#/dashboard',
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification &&
      event.notification.data &&
      typeof event.notification.data.url === 'string' &&
      event.notification.data.url) ||
    '/#/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const resolvedUrl = new URL(targetUrl, self.location.origin).href;
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => {
            if (focused && 'navigate' in focused) {
              return focused.navigate(resolvedUrl).catch(() => focused);
            }
            return focused;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(resolvedUrl);
      }
      return undefined;
    })
  );
});
