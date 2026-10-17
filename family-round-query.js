(() => {
  'use strict';

  const PAIRING_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing';
  const SCORE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-score';
  const DECK_HISTORY_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-deck-history';
  const SUMMARY_KEY = 'ptcgFamilyLatestMatch';
  const CONTEXT_KEY = 'ptcgFamilyRoundContextV230';
  const HISTORY_KEY = 'ptcgFamilyRoundHistoryV230';
  const CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const $ = id => document.getElementById(id);

  function extractPlayerId(value = '') {
    const match = String(value).match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function readJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) {}
  }

  function tidFromOfficial(value = '') {
    try { return new URL(value, window.location.origin).searchParams.get('tid') || ''; }
    catch (_) { return ''; }
  }

  function summaryFromPage() {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('type') || '') === 'round') {
      return {
        type: 'round',
        round: params.get('round') || '',
        player: params.get('player') || '',
        table: params.get('table') || '',
        opponent: params.get('opponent') || '',
        opponent_id: params.get('opponent_id') || '',
        deck: params.get('deck') || '',
        possible_deck: params.get('possible_deck') || '',
        previous_deck: params.get('previous_deck') || '',
        ttl_score: params.get('ttl_score') || '',
        official: params.get('official') || '',
        saved_at: new Date().toISOString()
      };
    }
    const stored = readJson(SUMMARY_KEY, null);
    return stored?.type === 'round' ? stored : null;
  }

  function historyMap() {
    const value = readJson(HISTORY_KEY, {});
    return value && typeof value === 'object' ? value : {};
  }

  function rememberRound(summary) {
    if (!summary || summary.type !== 'round') return null;
    const round = Number(summary.round || 0);
    const playerId = extractPlayerId(summary.player);
    const official = String(summary.official || '');
    const tid = tidFromOfficial(official);
    if (!Number.isInteger(round) || round < 1 || !playerId || !tid || !official) return null;

    const oldContext = readJson(CONTEXT_KEY, null);
    const sameEvent = oldContext?.tid === tid && oldContext?.player_id === playerId;
    const context = {
      tid,
      player_id: playerId,
      player: summary.player || playerId,
      official,
      max_round: sameEvent ? Math.max(Number(oldContext.max_round || 0), round) : round,
      updated_at: new Date().toISOString()
    };
    writeJson(CONTEXT_KEY, context);

    const history = historyMap();
    history[`${tid}:${round}`] = { ...summary, round: String(round), tid, saved_at: new Date().toISOString() };
    const entries = Object.entries(history)
      .sort((a, b) => Date.parse(b[1]?.saved_at || '') - Date.parse(a[1]?.saved_at || ''))
      .slice(0, 24);
    writeJson(HISTORY_KEY, Object.fromEntries(entries));
    return context;
  }

  function currentContext() {
    const latest = summaryFromPage();
    if (latest) rememberRound(latest);
    const context = readJson(CONTEXT_KEY, null);
    if (!context?.tid || !context?.player_id || !context?.official || Number(context.max_round || 0) < 1) return null;
    const updatedAt = Date.parse(context.updated_at || '');
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > CONTEXT_TTL_MS) return null;
    return context;
  }

  function roundUrl(context, round) {
    const url = new URL(context.official);
    if (/\/tour\.asp$/i.test(url.pathname)) url.pathname = url.pathname.replace(/tour\.asp$/i, 'tourround.asp');
    url.protocol = 'https:';
    url.searchParams.set('kno', String(round));
    url.searchParams.set('znt', '0');
    return url.toString();
  }

  function removeSourceCard() {
    document.querySelectorAll('#familyMatchGrid .family-source-card').forEach(card => card.remove());
  }

  function setQueryMessage(text = '', type = '') {
    const el = $('familyRoundQueryMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `family-round-query-message${type ? ` ${type}` : ''}`;
  }

  function syncControls(context, round = null) {
    const section = $('familyRoundQuery');
    if (!section) return;
    if (!context) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const max = Number(context.max_round || 1);
    const input = $('familyRoundInput');
    const current = round ?? (Number(input?.value || max) || max);
    if (input) {
      input.max = String(max);
      input.value = String(Math.min(Math.max(current, 1), max));
    }
    if ($('familyRoundCurrent')) $('familyRoundCurrent').textContent = `目前 Round ${max}`;
    if ($('familyRoundPrev')) $('familyRoundPrev').disabled = current <= 1;
    if ($('familyRoundNext')) $('familyRoundNext').disabled = current >= max;
  }

  async function publicLookup(url, playerId) {
    const response = await fetch(PAIRING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ url, player: playerId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || '配對查詢失敗');
    return data;
  }

  async function scoreLookup(url, playerId) {
    try {
      const response = await fetch(SCORE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ url, player: playerId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) return '';
      return String(data?.ttl_score ?? '').trim();
    } catch (_) {
      return '';
    }
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

  async function previousDeckLookup(context, opponentId) {
    if (!opponentId) return '';
    const endpoint = await familySubscriptionEndpoint();
    if (!endpoint) return '';
    try {
      const response = await fetch(DECK_HISTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ endpoint, player_id: opponentId, current_tid: context.tid })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.found) return '';
      return String(data.deck || '');
    } catch (_) {
      return '';
    }
  }

  function knownRound(context, round, opponentId) {
    const saved = historyMap()[`${context.tid}:${round}`];
    if (!saved) return null;
    const savedOpponentId = extractPlayerId(saved.opponent_id || saved.opponent);
    if (opponentId && savedOpponentId && savedOpponentId !== opponentId) return null;
    return saved;
  }

  function renderSummary(summary, context) {
    writeJson(SUMMARY_KEY, summary);
    rememberRound(summary);

    const params = new URLSearchParams({
      type: 'round',
      round: String(summary.round || ''),
      player: String(summary.player || ''),
      table: String(summary.table || ''),
      opponent: String(summary.opponent || ''),
      official: String(summary.official || '')
    });
    if (summary.opponent_id) params.set('opponent_id', summary.opponent_id);
    if (summary.deck) params.set('deck', summary.deck);
    if (summary.possible_deck) params.set('possible_deck', summary.possible_deck);
    if (summary.previous_deck) params.set('previous_deck', summary.previous_deck);
    if (summary.ttl_score) params.set('ttl_score', summary.ttl_score);
    history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);

    window.familyRenderMatchSummary?.();
    removeSourceCard();
    const eyebrow = $('familyMatchEyebrow');
    if (eyebrow) eyebrow.textContent = Number(summary.round) === Number(context.max_round) ? '目前配對' : '歷史查詢';
    if (!summary.deck && !summary.possible_deck && !summary.previous_deck) {
      const card = document.querySelector('#familyMatchGrid .family-deck-card');
      if (card) {
        const span = card.querySelector('span');
        const strong = card.querySelector('strong');
        if (span) span.textContent = '對手牌組';
        if (strong) strong.textContent = '尚未記錄';
      }
    }
    window.PTCGPlayerBadges?.refresh?.();
  }

  async function queryRound(roundValue) {
    const context = currentContext();
    if (!context) {
      setQueryMessage('尚未取得可查詢的比賽資料，請先收到一則 Round 配對通知。', 'error');
      return;
    }
    const max = Number(context.max_round || 0);
    const round = Number(roundValue);
    if (!Number.isInteger(round) || round < 1 || round > max) {
      setQueryMessage(`可查詢 Round 1～${max}。`, 'error');
      syncControls(context);
      return;
    }

    const button = $('familyRoundLookupButton');
    if (button) button.disabled = true;
    setQueryMessage(`正在查詢 Round ${round}…`);
    try {
      const official = roundUrl(context, round);
      const pairing = await publicLookup(official, context.player_id);
      if (!pairing?.available) throw new Error(`Round ${round} 尚未公布`);
      if (!pairing?.match) throw new Error(`Round ${round} 找不到這位玩家`);

      const opponentId = extractPlayerId(pairing.match.opponent);
      const known = knownRound(context, round, opponentId);
      const score = await scoreLookup(official, context.player_id);
      const previousDeck = known?.previous_deck || (!known?.deck && !known?.possible_deck ? await previousDeckLookup(context, opponentId) : '');
      const opponent = known?.opponent || pairing.match.opponent_name || opponentId || pairing.match.opponent || '—';
      const summary = {
        type: 'round',
        round: String(round),
        player: known?.player || context.player || context.player_id,
        table: String(pairing.match.table || known?.table || '—'),
        opponent,
        opponent_id: opponentId,
        deck: known?.deck || '',
        possible_deck: known?.possible_deck || '',
        previous_deck: previousDeck,
        ttl_score: score || String(pairing.match.ttl_score || known?.ttl_score || ''),
        official,
        saved_at: new Date().toISOString()
      };
      renderSummary(summary, context);
      syncControls(context, round);
      setQueryMessage(`Round ${round} 查詢完成。`, 'success');
    } catch (error) {
      setQueryMessage(error?.message || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function install() {
    const context = currentContext();
    removeSourceCard();
    syncControls(context, context?.max_round || null);

    $('familyRoundLookupButton')?.addEventListener('click', () => queryRound($('familyRoundInput')?.value));
    $('familyRoundCurrentButton')?.addEventListener('click', () => {
      const value = currentContext()?.max_round;
      if (value) queryRound(value);
    });
    $('familyRoundPrev')?.addEventListener('click', () => {
      const input = $('familyRoundInput');
      if (!input) return;
      queryRound(Math.max(1, Number(input.value || 1) - 1));
    });
    $('familyRoundNext')?.addEventListener('click', () => {
      const contextNow = currentContext();
      const input = $('familyRoundInput');
      if (!input || !contextNow) return;
      queryRound(Math.min(Number(contextNow.max_round || 1), Number(input.value || 1) + 1));
    });
    $('familyRoundInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') queryRound(event.currentTarget.value);
    });

    const summary = $('familyMatchSummary');
    if (summary) {
      new MutationObserver(() => removeSourceCard()).observe(summary, { childList: true, subtree: true });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', () => window.setTimeout(() => {
        const next = summaryFromPage();
        if (next) rememberRound(next);
        syncControls(currentContext());
        removeSourceCard();
      }, 120));
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const next = summaryFromPage();
        if (next) rememberRound(next);
        syncControls(currentContext());
        removeSourceCard();
      }
    });

    const version = document.querySelector('.family-notify-version strong');
    if (version) version.textContent = '目前版本 v2.3.0';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
