self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function buildPairingSummaryUrl(payload = {}) {
  const title = String(payload.title || '');
  const body = String(payload.body || '');
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean);
  const params = new URLSearchParams();

  const officialLine = lines.find(line => /^官方(?:配對|排名)：/.test(line)) || '';
  const official = officialLine.replace(/^官方(?:配對|排名)：/, '').trim();
  const player = lines[0] || '';

  if (/最終排名/.test(title)) {
    const rankLine = lines.find(line => /^最終排名：/.test(line)) || '';
    const rank = rankLine.replace(/^最終排名：/, '').replace(/^第\s*/, '').replace(/\s*名$/, '').trim();
    params.set('type', 'final');
    if (player) params.set('player', player);
    if (rank) params.set('rank', rank);
    if (official) params.set('official', official);
    return `/ptcg-ranking/family-notify.html?${params.toString()}`;
  }

  const roundMatch = title.match(/Round\s*(\d+)/i);
  const tableLine = lines.find(line => /^桌號：/.test(line)) || '';
  const opponentLine = lines.find(line => /^對手：/.test(line)) || '';
  const deckLine = lines.find(line => /^已記錄牌組：/.test(line)) || '';
  const possibleDeckLine = lines.find(line => /^可能牌組：/.test(line)) || '';
  params.set('type', 'round');
  if (roundMatch?.[1]) params.set('round', roundMatch[1]);
  if (player) params.set('player', player);
  if (tableLine) params.set('table', tableLine.replace(/^桌號：/, '').trim());
  if (opponentLine) params.set('opponent', opponentLine.replace(/^對手：/, '').trim());
  if (deckLine) params.set('deck', deckLine.replace(/^已記錄牌組：/, '').trim());
  if (possibleDeckLine) params.set('possible_deck', possibleDeckLine.replace(/^可能牌組：/, '').trim());
  if (official) params.set('official', official);
  return `/ptcg-ranking/family-notify.html?${params.toString()}`;
}

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'PTCG 更新';
  const tag = payload.tag || 'ptcg-update';
  const targetUrl = tag === 'ptcg-pairing'
    ? buildPairingSummaryUrl(payload)
    : (payload.url || '/ptcg-ranking/');
  const options = {
    body: payload.body || '網站有新的資料更新。',
    tag,
    data: { url: targetUrl }
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
