(() => {
  const MARK_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-player-mark';
  const DECK_HISTORY_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-deck-history';
  const FAMILY_MATCH_STORAGE_KEY = 'ptcgFamilyLatestMatch';

  function extractPlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function storedSummary() {
    try {
      return JSON.parse(localStorage.getItem(FAMILY_MATCH_STORAGE_KEY) || 'null') || null;
    } catch (_) {
      return null;
    }
  }

  function currentOpponentId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('opponent_id') || '').trim().toLowerCase()
      || extractPlayerId(params.get('opponent'))
      || extractPlayerId(storedSummary()?.opponent);
  }

  function currentTid() {
    const params = new URLSearchParams(window.location.search);
    const official = params.get('official') || storedSummary()?.official || '';
    try {
      return new URL(official).searchParams.get('tid') || '';
    } catch (_) {
      return '';
    }
  }

  function currentSummaryHasDeck() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('deck') || params.get('possible_deck')) return true;
    const stored = storedSummary();
    return Boolean(stored?.deck || stored?.possible_deck);
  }

  async function familySubscriptionEndpoint() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return '';
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return String(subscription?.endpoint || '');
    } catch (_) {
      return '';
    }
  }

  async function refreshFamilyAttention() {
    const playerId = currentOpponentId();
    if (!playerId) return;
    const endpoint = await familySubscriptionEndpoint();
    if (!endpoint) return;

    try {
      const response = await fetch(MARK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, player_id: playerId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error('attention lookup failed');
      const url = new URL(window.location.href);
      if (data.attention) url.searchParams.set('opponent_attention', '1');
      else url.searchParams.delete('opponent_attention');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      window.PTCGPlayerBadges?.refresh?.();
    } catch (error) {
      console.warn('家庭注意標記讀取失敗', error);
    }
  }

  function renderPreviousDeck(deck = '') {
    const grid = document.getElementById('familyMatchGrid');
    if (!grid) return;
    grid.querySelector('.family-previous-deck')?.remove();
    if (!deck || currentSummaryHasDeck()) return;

    const article = document.createElement('article');
    article.className = 'family-match-wide family-previous-deck';
    const span = document.createElement('span');
    span.textContent = '上次比賽牌組';
    const strong = document.createElement('strong');
    strong.textContent = deck;
    article.append(span, strong);
    grid.appendChild(article);
  }

  async function refreshPreviousDeck() {
    if (currentSummaryHasDeck()) {
      renderPreviousDeck('');
      return;
    }
    const playerId = currentOpponentId();
    if (!playerId) return;
    const endpoint = await familySubscriptionEndpoint();
    if (!endpoint) return;

    try {
      const response = await fetch(DECK_HISTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, player_id: playerId, current_tid: currentTid() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error('deck history lookup failed');
      renderPreviousDeck(data.found ? String(data.deck || '') : '');
    } catch (error) {
      console.warn('家庭上次牌組讀取失敗', error);
    }
  }

  function updateFamilyVersion() {
    const version = document.querySelector('.family-notify-version strong');
    if (version) version.textContent = '目前版本 v2.2.2';
  }

  function scheduleRefresh(delay = 250) {
    window.setTimeout(() => {
      refreshFamilyAttention();
      refreshPreviousDeck();
      updateFamilyVersion();
    }, delay);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', () => scheduleRefresh(300));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh(100);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateFamilyVersion();
      scheduleRefresh(500);
      scheduleRefresh(1400);
    }, { once: true });
  } else {
    updateFamilyVersion();
    scheduleRefresh(500);
    scheduleRefresh(1400);
  }
})();
