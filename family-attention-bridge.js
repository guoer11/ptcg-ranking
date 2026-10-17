(() => {
  const MARK_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-player-mark';
  const DECK_HISTORY_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-deck-history';
  const SCORE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-score';
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

  function currentParams() {
    return new URLSearchParams(window.location.search);
  }

  function currentPlayerId() {
    const params = currentParams();
    return extractPlayerId(params.get('player')) || extractPlayerId(storedSummary()?.player);
  }

  function currentOpponentId() {
    const params = currentParams();
    return String(params.get('opponent_id') || '').trim().toLowerCase()
      || extractPlayerId(params.get('opponent'))
      || extractPlayerId(storedSummary()?.opponent);
  }

  function currentOfficial() {
    const params = currentParams();
    return params.get('official') || storedSummary()?.official || '';
  }

  function currentTid() {
    try {
      return new URL(currentOfficial()).searchParams.get('tid') || '';
    } catch (_) {
      return '';
    }
  }

  function isRoundSummary() {
    const params = currentParams();
    const type = params.get('type') || storedSummary()?.type || '';
    return type === 'round';
  }

  function currentSummaryHasDeck() {
    const params = currentParams();
    if (params.get('deck') || params.get('possible_deck') || params.get('previous_deck')) return true;
    const stored = storedSummary();
    return Boolean(stored?.deck || stored?.possible_deck || stored?.previous_deck);
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

  function setDeckCard(label, deck, state = '') {
    const card = document.querySelector('#familyMatchGrid .family-deck-card');
    if (!card) return;
    card.classList.remove('is-known', 'is-possible', 'is-previous');
    if (state) card.classList.add(state);
    const span = card.querySelector('span');
    const strong = card.querySelector('strong');
    if (span) span.textContent = label;
    if (strong) strong.textContent = deck;
  }

  function renderPreviousDeck(deck = '') {
    if (currentSummaryHasDeck()) return;
    if (deck) setDeckCard('上次比賽牌組', deck, 'is-previous');
    else setDeckCard('對手牌組', '尚未記錄');
  }

  async function refreshPreviousDeck() {
    if (!isRoundSummary()) return;
    if (currentSummaryHasDeck()) return;
    const playerId = currentOpponentId();
    if (!playerId) {
      renderPreviousDeck('');
      return;
    }
    const endpoint = await familySubscriptionEndpoint();
    if (!endpoint) {
      renderPreviousDeck('');
      return;
    }

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
      renderPreviousDeck('');
    }
  }

  function setScoreCard(value, note = '') {
    const card = document.querySelector('#familyMatchGrid .family-score-card');
    if (!card) return;
    const strong = card.querySelector('strong');
    if (strong) strong.textContent = value;
    if (note) card.title = note;
  }

  async function refreshFamilyScore() {
    if (!isRoundSummary()) return;
    const playerId = currentPlayerId();
    const official = currentOfficial();
    if (!playerId || !official) {
      setScoreCard('—', '無法取得玩家或官方網址');
      return;
    }

    setScoreCard('讀取中…', '正在讀取官方 TtlScore');
    try {
      const response = await fetch(SCORE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ url: official, player: playerId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'score lookup failed');
      const score = data?.ttl_score;
      if (score !== null && score !== undefined && String(score).trim() !== '') {
        setScoreCard(String(score).trim(), '官方目前累計分數');
      } else {
        setScoreCard('—', '官方頁目前未取得 TtlScore');
      }
    } catch (error) {
      console.warn('家庭 TtlScore 讀取失敗', error);
      setScoreCard('—', 'TtlScore 讀取失敗');
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
      refreshFamilyScore();
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
