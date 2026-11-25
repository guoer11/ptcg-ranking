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
    if(params.has('players')||Array.isArray(storedSummary()?.players))return false;
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
      return subscription?.toJSON?.()||null;
    } catch (_) {
      return '';
    }
  }

  let markGeneration=0, lastHostKey='', marksTimer=0;
  function familyHostIds(){
    return [...new Set([...document.querySelectorAll('#familyMatchSummary:not([hidden]) [data-family-badge-id]')].map(host=>String(host.dataset.familyBadgeId||'').toLowerCase()).filter(id=>/^tw\d{1,16}$/.test(id)))].sort();
  }
  async function refreshFamilyAttention(){
    const generation=++markGeneration;
    const ids=familyHostIds(),key=ids.join(',');
    lastHostKey=key;
    const clear=()=>{if(generation===markGeneration)window.PTCGPlayerBadges?.setFamilyMarks({});};
    if(!ids.length||!('serviceWorker' in navigator)||!('PushManager' in window)){clear();return;}
    try{
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      const credentials=subscription?.toJSON?.();
      if(!credentials?.endpoint||!credentials?.keys?.auth){clear();return;}
      const response=await fetch(MARK_URL,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'family-marks',endpoint:credentials.endpoint,auth:credentials.keys.auth,player_ids:ids})});
      const data=await response.json().catch(()=>({}));
      if(generation!==markGeneration||familyHostIds().join(',')!==key)return;
      if(!response.ok||!data?.ok){clear();return;}
      const marks=Object.fromEntries(ids.map(id=>[id,{attention:data.marks?.[id]?.attention===true,note:String(data.marks?.[id]?.note||'')}]));
      window.PTCGPlayerBadges?.setFamilyMarks(marks);
    }catch(error){clear();console.warn('家庭注意標記讀取失敗',error);}
  }
  function watchFamilyBadgeHosts(){
    const root=document.getElementById('familyMatchSummary');if(!root)return;
    new MutationObserver(()=>{
      const key=familyHostIds().join(',');
      if(key===lastHostKey)return;
      lastHostKey=key;
      ++markGeneration;
      window.PTCGPlayerBadges?.setFamilyMarks({});
      clearTimeout(marksTimer);
      marksTimer=window.setTimeout(refreshFamilyAttention,100);
    }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-family-badge-id']});
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
    const credentials = await familySubscriptionEndpoint();
    const endpoint=credentials?.endpoint;
    if (!endpoint) {
      renderPreviousDeck('');
      return;
    }

    try {
      const response = await fetch(DECK_HISTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, auth:credentials.keys?.auth, player_id: playerId, current_tid: currentTid() })
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
    if (version) version.textContent = '目前版本 v2.4.1';
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
      watchFamilyBadgeHosts();
      scheduleRefresh(500);
      scheduleRefresh(1400);
    }, { once: true });
  } else {
    updateFamilyVersion();
    watchFamilyBadgeHosts();
    scheduleRefresh(500);
    scheduleRefresh(1400);
  }
})();
