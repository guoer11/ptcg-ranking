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

  function isBarePlayerId(value = '', expectedId = '') {
    const text = String(value || '').trim().toLowerCase();
    const id = String(expectedId || extractPlayerId(text) || '').toLowerCase();
    return Boolean(id && text === id);
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

  function tidFromOfficial(value = '') {
    try { return new URL(value, window.location.origin).searchParams.get('tid') || ''; }
    catch (_) { return ''; }
  }

  function summaryFromUrl(value = window.location.href) {
    try {
      const url = new URL(value, window.location.origin);
      const params = url.searchParams;
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
    } catch (_) {
      return null;
    }
  }

  function sameRound(a, b) {
    if (!a || !b) return false;
    return String(a.round || '') === String(b.round || '')
      && tidFromOfficial(a.official) === tidFromOfficial(b.official);
  }

  function mergeSummary(base, incoming) {
    if (!base) return incoming;
    if (!incoming) return base;
    if (!sameRound(base, incoming)) return incoming;
    const merged = { ...base };
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== '' && value !== null && value !== undefined) merged[key] = value;
    }
    merged.saved_at = new Date().toISOString();
    return merged;
  }

  function latestSummary() {
    const fromUrl = summaryFromUrl();
    const stored = readJson(SUMMARY_KEY, null);
    if (fromUrl?.type === 'round') return mergeSummary(stored?.type === 'round' ? stored : null, fromUrl);
    return stored?.type === 'round' ? stored : null;
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

    const stored = readJson(SUMMARY_KEY, null);
    const merged = mergeSummary(stored?.type === 'round' ? stored : null, summary);
    writeJson(SUMMARY_KEY, merged);

    const old = readJson(CONTEXT_KEY, null);
    const same = old?.tid === tid && old?.player_id === playerId;
    const context = {
      tid,
      player_id: playerId,
      player: merged.player || summary.player || playerId,
      official,
      max_round: same ? Math.max(Number(old.max_round || 0), round) : round,
      updated_at: new Date().toISOString()
    };
    writeJson(CONTEXT_KEY, context);

    const history = historyMap();
    const key = `${tid}:${round}`;
    history[key] = mergeSummary(history[key] || null, { ...merged, tid, round: String(round) });
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
    const chosen = selectedRound === null || selectedRound === undefined ? fallback : Number(selectedRound);
    const current = Math.min(max, Math.max(1, Number(chosen) || max));
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

  async function opponentKnowledgeLookup(context, opponentId) {
    const empty = { name: '', confirmedDeck: '', possibleDeck: '', previousDeck: '' };
    if (!opponentId) return empty;
    const endpoint = await subscriptionEndpoint();
    if (!endpoint) return empty;
    try {
      const response = await fetch(DECK_HISTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ endpoint, player_id: opponentId, current_tid: context.tid })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) return empty;
      const possible = Array.isArray(data.possible_decks)
        ? data.possible_decks.map(value => String(value || '').trim()).filter(Boolean).join(' / ')
        : '';
      return {
        name: String(data.name || '').trim(),
        confirmedDeck: String(data.confirmed_deck || '').trim(),
        possibleDeck: possible,
        previousDeck: String(data.previous_deck || '').trim()
      };
    } catch (_) {
      return empty;
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
    params.set('_v', '230r4');
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
      <article class="family-opponent-card"><span>對手</span><strong>${esc(summary.opponent || summary.opponent_id || '—')}</strong></article>
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

  function summaryNeedsRefresh(summary) {
    if (!summary || summary.type !== 'round') return false;
    const table = String(summary.table || '').trim();
    const opponent = String(summary.opponent || summary.opponent_id || '').trim();
    const opponentId = extractPlayerId(summary.opponent_id || opponent);
    return !table || table === '—' || !opponent || opponent === '—' || isBarePlayerId(opponent, opponentId);
  }

  async function queryRound(roundValue, options = {}) {
    const { silent = false, updateUrl = true } = options;
    const context = currentContext();
    if (!context) {
      if (!silent) setMessage('尚未取得可查詢的比賽資料，請先收到一則 Round 配對通知。', 'error');
      return false;
    }

    const max = Number(context.max_round || 0);
    const round = Number(roundValue);
    if (!Number.isInteger(round) || round < 1 || round > max) {
      if (!silent) setMessage(`可查詢 Round 1～${max}。`, 'error');
      syncControls(context);
      return false;
    }

    const button = byId('familyRoundLookupButton');
    if (button) button.disabled = true;
    if (!silent) setMessage(`正在查詢 Round ${round}…`);

    try {
      const official = roundUrl(context, round);
      const pairing = await pairingLookup(official, context.player_id);
      if (!pairing?.available) throw new Error(`Round ${round} 尚未公布`);
      if (!pairing?.match) throw new Error(`Round ${round} 找不到這位玩家`);

      const opponentId = extractPlayerId(pairing.match.opponent);
      const known = rememberedRound(context, round, opponentId);
      const [score, knowledge] = await Promise.all([
        scoreLookup(official, context.player_id),
        opponentKnowledgeLookup(context, opponentId)
      ]);

      const knownOpponent = known?.opponent && !isBarePlayerId(known.opponent, opponentId)
        ? String(known.opponent)
        : '';
      const resolvedOpponentName = knowledge.name || String(pairing.match.opponent_name || '').trim();
      const opponentLabel = knownOpponent
        || (resolvedOpponentName && opponentId ? `${resolvedOpponentName} (${opponentId})` : resolvedOpponentName)
        || opponentId
        || pairing.match.opponent
        || '—';
      const playerLabel = known?.player
        || (pairing.match.player_name ? `${pairing.match.player_name} (${context.player_id})` : '')
        || context.player
        || context.player_id;

      const confirmedDeck = known?.deck || knowledge.confirmedDeck || '';
      const possibleDeck = confirmedDeck ? '' : (known?.possible_deck || knowledge.possibleDeck || '');
      const previousDeck = confirmedDeck || possibleDeck ? '' : (known?.previous_deck || knowledge.previousDeck || '');

      const summary = {
        type: 'round',
        round: String(round),
        player: playerLabel,
        table: String(pairing.match.table || known?.table || '—'),
        opponent: opponentLabel,
        opponent_id: opponentId,
        deck: confirmedDeck,
        possible_deck: possibleDeck,
        previous_deck: previousDeck,
        ttl_score: score || String(pairing.match.ttl_score || known?.ttl_score || ''),
        official,
        saved_at: new Date().toISOString()
      };

      const nextContext = rememberSummary(summary) || context;
      if (updateUrl) updateAddress(summary);
      renderRound(summary, nextContext);
      syncControls(nextContext, round);
      if (!silent) setMessage(`Round ${round} 查詢完成。`, 'success');
      return true;
    } catch (error) {
      if (!silent) setMessage(error?.message || String(error), 'error');
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function ingestNotificationUrl(urlValue) {
    const incoming = summaryFromUrl(urlValue);
    if (!incoming) return;
    const stored = readJson(SUMMARY_KEY, null);
    const merged = mergeSummary(stored?.type === 'round' ? stored : null, incoming);
    const context = rememberSummary(merged) || currentContext();
    if (context) {
      renderRound(merged, context);
      syncControls(context, Number(merged.round || context.max_round));
      if (summaryNeedsRefresh(merged)) {
        window.setTimeout(() => queryRound(context.max_round, { silent: true, updateUrl: true }), 80);
      }
    }
  }

  function refreshFromCurrentState({ autoFill = true } = {}) {
    const summary = latestSummary();
    if (summary) rememberSummary(summary);
    const context = currentContext();
    syncControls(context, summary?.round || context?.max_round || null);
    if (context && summary) renderRound(summary, context);
    if (autoFill && context && summaryNeedsRefresh(summary)) {
      window.setTimeout(() => queryRound(context.max_round, { silent: true, updateUrl: true }), 120);
    }
  }

  function install() {
    document.querySelectorAll('#familyMatchGrid .family-source-card').forEach(card => card.remove());
    refreshFromCurrentState({ autoFill: true });

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
      navigator.serviceWorker.addEventListener('message', event => {
        const message = event?.data || {};
        if (message.type === 'ptcg-family-update' && message.url) {
          window.setTimeout(() => ingestNotificationUrl(message.url), 20);
          return;
        }
        window.setTimeout(() => refreshFromCurrentState({ autoFill: true }), 120);
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshFromCurrentState({ autoFill: true });
    });
    window.addEventListener('pageshow', () => refreshFromCurrentState({ autoFill: true }));

    const version = document.querySelector('.family-notify-version strong');
    if (version) version.textContent = '目前版本 v2.3.0';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();