self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'PTCG 更新';
  const options = {
    body: payload.body || '網站有新的資料更新。',
    tag: payload.tag || 'ptcg-update',
    data: { url: payload.url || '/ptcg-ranking/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/ptcg-ranking/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client && client.url !== targetUrl) {
        try { await client.navigate(targetUrl); } catch (_) {}
      }
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
