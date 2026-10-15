/* 새 건 푸시 알림을 받아 띄우고, 누르면 그 건을 연다. (원본: shared/sw.js) 캐시는 하지 않는다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: '홈루덴스', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '홈루덴스', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: 'notify-icon.png',
    badge: 'notify-icon.png',
    data: { url: d.url || self.registration.scope }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) {
      if (w.url.startsWith(self.registration.scope)) { w.focus(); return w.navigate ? w.navigate(url) : null; }
    }
    return self.clients.openWindow(url);
  }));
});
