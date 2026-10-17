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
    params.set('_v', '230r3');
    return `/ptcg-ranking/family-notify.html?${params.toString()}`;
  }

  const roundMatch = title.match(/Round\s*(\d+)/i);
  const tableLine = lines.find(line => /^桌號：/.test(line)) || '';
  const opponentLine = lines.find(line => /^對手：/.test(line)) || '';
  const deckLine = lines.find(line => /^已記錄牌組：/.test(line)) || '';
  const previousDeckLine = lines.find(line => /^上次比賽牌組：/.test(line)) || '';
  const possibleDeckLine = lines.find(line => /^可能牌組：/.test(line)) || '';
  params.set('type', 'round');
  if (roundMatch?.[1]) params.set('round', roundMatch[1]);
  if (player) params.set('player', player);
  if (tableLine) params.set('table', tableLine.replace(/^桌號：/, '').trim());
  if (opponentLine) params.set('opponent', opponentLine.replace(/^對手：/, '').trim());
  if (deckLine) params.set('deck', deckLine.replace(/^已記錄牌組：/, '').trim());
  if (previousDeckLine) params.set('previous_deck', previousDeckLine.replace(/^上次比賽牌組：/, '').trim());
  if (possibleDeckLine) params.set('possible_deck', possibleDeckLine.replace(/^可能牌組：/, '').trim());
  if (official) params.set('official', official);
  params.set('_v', '230r3');
  return `/ptcg-ranking/family-notify.html?${params.toString()}`;
}

function withFamilyRevision(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (!/\/family-notify\.html$/i.test(url.pathname)) return url.href;
    url.searchParams.set('_v', '230r3');
    return url.href;
  } catch (_) {
    return value;
  }
}

async function broadcastFamilyPairingUpdate(targetUrl) {
  const absoluteUrl = withFamilyRevision(targetUrl);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      const clientUrl = new URL(client.url);
      if (!/\/family-notify\.html$/i.test(clientUrl.pathname)) continue;
      client.postMessage({
        type: 'ptcg-family-update',
        url: absoluteUrl
      });
    } catch (_) {}
  }
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
  let targetUrl = payload.url || '/ptcg-ranking/';
  if (tag === 'ptcg-pairing') {
    targetUrl = payload.url || '/ptcg-ranking/pairing.html';
  } else if (tag === 'ptcg-family-pairing') {
    targetUrl = withFamilyRevision(payload.url || buildPairingSummaryUrl(payload));
  }

  const options = {
    body: payload.body || '網站有新的資料更新。',
    tag,
    data: { url: targetUrl }
  };

  const tasks = [self.registration.showNotification(title, options)];
  if (tag === 'ptcg-family-pairing') tasks.push(broadcastFamilyPairingUpdate(targetUrl));
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tag = String(event.notification?.tag || '');
  const rawTarget = event.notification?.data?.url || '/ptcg-ranking/';
  const targetUrl = tag === 'ptcg-family-pairing'
    ? withFamilyRevision(rawTarget)
    : new URL(rawTarget, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    if (tag === 'ptcg-family-pairing') {
      for (const client of windows) {
        try {
          const clientUrl = new URL(client.url);
          if (!/\/family-notify\.html$/i.test(clientUrl.pathname)) continue;
          client.postMessage({ type: 'ptcg-family-update', url: targetUrl });
          if ('focus' in client) return client.focus();
        } catch (_) {}
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return;
    }

    for (const client of windows) {
      if ('navigate' in client && client.url !== targetUrl) {
        try { await client.navigate(targetUrl); } catch (_) {}
      }
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});