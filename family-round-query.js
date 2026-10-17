(() => {
  'use strict';

  const PAIRING_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing';
  const SCORE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-score';
  const DECK_HISTORY_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-deck-history';
  const SUMMARY_KEY = 'ptcgFamilyLatestMatch';
  const CONTEXT_KEY = 'ptcgFamilyRoundContextV230';
  const HISTORY_KEY = 'ptcgFamilyRoundHistoryV230';
  const CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function extractPlayerId(value = '') {
    const match = String(value).match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function readJson(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function paramsSummary() {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('type') || '') !== 'round') return null;
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

  function latestSummary() {
    return paramsSummary() || (() => {
      const stored = readJson(SUMMARY_KEY, null);
      return stored?.type === 'round' ? stored : null;
    })();
  }

  function tidFromOfficial(value = '') {
    try { return new URL(value, window.location.origin).searchParams.get('tid') || ''; }
    catch (_) { return ''; }
  }

  function historyMap() {
    const value = readJson(HISTORY_KEY, {});
    return value && typeof value === 'object' ? value : {};
  }

  function rememberSummary(summary) {
    if (!summary || summary.type !== 'round') return null;
    const round = Number(summary.round || 0);
    const playerId = extractPlayerId(summary.player);
    const official = String(summary.official || '');
    const tid = tidFromOfficial(official);
    if (!Number.isInteger(round) || round < 1 || !playerId || !tid || !official) return null;

    const old = readJson(CONTEXT_KEY, null);
    const same = old?.tid === tid && old?.player_id === playerId;
    const context = {
      tid,
      player_id: playerId,
      player: summary.player || playerId,
      official,
      max_round: same ? Math.max(Number(old.max_round || 0), round) : round,
      updated_at: new Date().toISOString()
    };
    writeJson(CONTEXT_KEY, context);
    writeJson(SUMMARY_KEY, summary);

    const history = historyMap();
    history[`${tid}:${round}`] = { ...summary, tid, round: String(round), saved_at: new Date().toISOString() };
    const trimmed = Object.entries(history)
      .sort((a, b) => Date.parse(b[1]?.saved_at || '') - Date.parse(a[1]?.saved_at || ''))
      .slice(0, 24);
    writeJson(HISTORY_KEY, Object.fromEntries(trimmed));
    return context;
  }

  function currentContext() {
    const summary = latestSummary();
    if (summary) rememberSummary(summary);
    const context = readJson(CONTEXT_KEY, null);
    if (!context?.tid || !context?.player_id || !context?.official || Number(context.max_round || 0) < 1) return null;
    const updated = Date.parse(context.updated_at || '');
    if (!Number.isFinite(updated) || Date.now() - updated > CONTEXT_TTL_MS) return null;
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

  function setMessage(text = '', type = '') {
    const el = byId('familyRoundQueryMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `family-round-query-message${type ? ` ${type}` : ''}`;
  }

  function syncControls(context, selectedRound = null) {
    const section = byId('familyRoundQuery');
    if (!section) return;
    if (!context) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const max = Math.max(1, Number(context.max_round || 1));
    const input = byId('familyRoundInput');
    const fallback = Number(input?.value || max) || max;
    const current = Math.min(max, Math.max(1, Number(selectedRound ?? fallback) || max));
    if (input) {
      input.min = '1';
      input.max = String(max);
      input.value = String(current);
    }
    if (byId('familyRoundCurrent')) byId('familyRoundCurrent').textContent = `目前 Round ${max}`;
    if (byId('familyRoundPrev')) byId('familyRoundPrev').disabled = current <= 1;
    if (byId('familyRoundNext')) byId('familyRoundNext').disabled = current >= max;
  }

  async function pairingLookup(url, playerId) {
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
      return String(data.ttl_score ?? '').trim();
    } catch (_) {
      return '';
    }
  }

  async function subscriptionEndpoint() {
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
    const endpoint = await subscriptionEndpoint();
    if (!endpoint) return '';
    try {
      const response = await fetch(DECK_HISTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ endpoint, player_id: opponentId, current_tid: context.tid })
      });
      const data = await response.json().catch(() => ({}));
      return response.ok && data?.ok && data?.found ? String(data.deck || '') : '';
    } catch (_) {
      return '';
    }
  }

  function rememberedRound(context, round, opponentId) {
    const saved = historyMap()[`${context.tid}:${round}`];
    if (!saved) return null;
    const savedOpponentId = extractPlayerId(saved.opponent_id || saved.opponent);
    if (opponentId && savedOpponentId && savedOpponentId !== opponentId) return null;
    return saved;
  }

  function updateAddress(summary) {
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
  }

  function renderRound(summary, context) {
    const grid = byId('familyMatchGrid');
    const box = byId('familyMatchSummary');
    if (!grid || !box) return;

    const deck = summary.deck || '';
    const possible = summary.possible_deck || '';
    const previous = summary.previous_deck || '';
    const deckLabel = deck ? '已記錄牌組' : (possible ? '可能牌組' : (previous ? '上次比賽牌組' : '對手牌組'));
    const deckValue = deck || possible || previous || '尚未記錄';

    if (byId('familyMatchEyebrow')) byId('familyMatchEyebrow').textContent = Number(summary.round) === Number(context.max_round) ? '目前配對' : '歷史查詢';
    if (byId('familyMatchTitle')) byId('familyMatchTitle').textContent = `Round ${summary.round}`;
    if (byId('familyMatchBadge')) byId('familyMatchBadge').textContent = `Round ${summary.round}`;

    grid.innerHTML = `
      <article class="family-match-wide family-table-card"><span>桌號</span><strong>${esc(summary.table || '—')}</strong></article>
      <article class="family-player-card"><span>玩家</span><strong>${esc(summary.player || context.player_id)}</strong></article>
      <article class="family-score-card"><span>TtlScore</span><strong>${esc(summary.ttl_score || '—')}</strong></article>
      <article class="family-opponent-card"><span>對手</span><strong>${esc(summary.opponent || '—')}</strong></article>
      <article class="family-deck-card"><span>${esc(deckLabel)}</span><strong>${esc(deckValue)}</strong></article>`;

    const link = byId('familyOfficialLink');
    if (link) {
      link.href = summary.official || '#';
      link.textContent = '開啟官方配對';
      link.hidden = !summary.official;
    }
    box.hidden = false;
    window.PTCGPlayerBadges?.refresh?.();
  }

  async function queryRound(roundValue) {
    const context = currentContext();
    if (!context) {
      setMessage('尚未取得可查詢的比賽資料，請先收到一則 Round 配對通知。', 'error');
      return;
    }

    const max = Number(context.max_round || 0);
    const round = Number(roundValue);
    if (!Number.isInteger(round) || round < 1 || round > max) {
      setMessage(`可查詢 Round 1～${max}。`, 'error');
      syncControls(context);
      return;
    }

    const button = byId('familyRoundLookupButton');
    if (button) button.disabled = true;
    setMessage(`正在查詢 Round ${round}…`);

    try {
      const official = roundUrl(context, round);
      const pairing = await pairingLookup(official, context.player_id);
      if (!pairing?.available) throw new Error(`Round ${round} 尚未公布`);
      if (!pairing?.match) throw new Error(`Round ${round} 找不到這位玩家`);

      const opponentId = extractPlayerId(pairing.match.opponent);
      const known = rememberedRound(context, round, opponentId);
      const [score, fallbackDeck] = await Promise.all([
        scoreLookup(official, context.player_id),
        !known?.deck && !known?.possible_deck && !known?.previous_deck ? previousDeckLookup(context, opponentId) : Promise.resolve('')
      ]);

      const summary = {
        type: 'round',
        round: String(round),
        player: known?.player || context.player || context.player_id,
        table: String(pairing.match.table || known?.table || '—'),
        opponent: known?.opponent || pairing.match.opponent_name || opponentId || pairing.match.opponent || '—',
        opponent_id: opponentId,
        deck: known?.deck || '',
        possible_deck: known?.possible_deck || '',
        previous_deck: known?.previous_deck || fallbackDeck || '',
        ttl_score: score || String(pairing.match.ttl_score || known?.ttl_score || ''),
        official,
        saved_at: new Date().toISOString()
      };

      rememberSummary(summary);
      updateAddress(summary);
      renderRound(summary, currentContext() || context);
      syncControls(currentContext() || context, round);
      setMessage(`Round ${round} 查詢完成。`, 'success');
    } catch (error) {
      setMessage(error?.message || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function install() {
    document.querySelectorAll('#familyMatchGrid .family-source-card').forEach(card => card.remove());
    const context = currentContext();
    syncControls(context, context?.max_round || null);

    byId('familyRoundLookupButton')?.addEventListener('click', () => queryRound(byId('familyRoundInput')?.value));
    byId('familyRoundCurrentButton')?.addEventListener('click', () => {
      const now = currentContext();
      if (now?.max_round) queryRound(now.max_round);
    });
    byId('familyRoundPrev')?.addEventListener('click', () => {
      const input = byId('familyRoundInput');
      if (input) queryRound(Math.max(1, Number(input.value || 1) - 1));
    });
    byId('familyRoundNext')?.addEventListener('click', () => {
      const now = currentContext();
      const input = byId('familyRoundInput');
      if (now && input) queryRound(Math.min(Number(now.max_round || 1), Number(input.value || 1) + 1));
    });
    byId('familyRoundInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') queryRound(event.currentTarget.value);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', () => setTimeout(() => {
        const next = latestSummary();
        if (next) rememberSummary(next);
        const now = currentContext();
        syncControls(now, now?.max_round || null);
      }, 150));
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const next = latestSummary();
        if (next) rememberSummary(next);
        const now = currentContext();
        syncControls(now, now?.max_round || null);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
