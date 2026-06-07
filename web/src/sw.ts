/// <reference lib="webworker" />
/**
 * Custom service worker (injectManifest). Precaches the app shell and handles
 * web-push events so a notification fires when analysis completes.
 */
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Injected at build time by vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title ?? 'Lookback';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? 'Something to talk about.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
