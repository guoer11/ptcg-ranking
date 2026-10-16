(() => {
  const MARK_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-player-mark';

  function extractPlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function currentOpponentId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('opponent_id') || '').trim().toLowerCase()
      || extractPlayerId(params.get('opponent'));
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

  function scheduleRefresh(delay = 250) {
    window.setTimeout(refreshFamilyAttention, delay);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', () => scheduleRefresh(300));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh(100);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleRefresh(500), { once: true });
  } else {
    scheduleRefresh(500);
  }
})();
