// AIVoiceConnect Service Worker
const CACHE = 'aivc-v1';
const SHELL = [
  '/dashboard',
  '/manifest.json',
  '/icons/icon-192.png',
];

// ── Install: cache app shell ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for shell ──
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Always go to network for API calls
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && e.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached || new Response('Offline — check your connection', { status: 503 }));
    })
  );
});

// ── Push: show notification ──
self.addEventListener('push', (e) => {
  let data = { title: 'AIVoiceConnect', body: 'You have a new update', tag: 'aivc', url: '/dashboard' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url },
      actions: data.actions || [],
      renotify: true,
    })
  );
});

// ── Notification click: open or focus dashboard ──
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/dashboard';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const match = all.find((c) => c.url.includes('/dashboard'));
      if (match) return match.focus();
      return clients.openWindow(target);
    })
  );
});
