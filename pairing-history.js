(() => {
  'use strict';

  if (window.__pairingHistoryLoaded) return;
  window.__pairingHistoryLoaded = true;

  const $ = id => document.getElementById(id);
  let lastMatchDetail = null;
  let refreshTimer = null;
  let deckSearchObserver = null;

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizePlayerId(value = '') {
    return String(value).trim().toLowerCase().replace(/\s+/g, '');
  }

  function currentUserId() {
    return pairingSession?.user?.id || '';
  }

  function dateParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  }

  function formatShortDate(value) {
    const parts = dateParts(value);
    return parts ? `${Number(parts.month)}/${Number(parts.day)}` : '';
  }

  function formatCompactDate(value) {
    const parts = dateParts(value);
    return parts ? `${parts.month}/${parts.day}` : '';
  }

  function seasonInfo(value) {
    const parts = dateParts(value);
    if (!parts) return { key: '', label: '未知賽季', start: 0 };
    const year = Number(parts.year);
    const month = Number(parts.month);
    const start = month >= 9 ? year : year - 1;
    return {
      key: `${start}-${start + 1}`,
      label: `${start}–${start + 1} 賽季`,
      start
    };
  }

  function currentSeasonKey() {
    return seasonInfo(Date.now()).key;
  }

  async function exactRows(tid = '') {
    if (!pairingClient || !pairingAuthorized || !currentUserId()) return [];
    let query = pairingClient
      .from('pairing_deck_scouts')
      .select('tid,player_id,deck_name,observed_round,table_no,created_at,updated_at')
      .eq('user_id', currentUserId());
    if (tid) query = query.eq('tid', String(tid));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function pairRows(tid = '') {
    if (!pairingClient || !pairingAuthorized || !currentUserId()) return [];
    let query = pairingClient
      .from('pairing_deck_pair_observations')
      .select('tid,round_no,table_no,player_a_id,player_b_id,deck_a,deck_b,created_at,updated_at')
      .eq('user_id', currentUserId());
    if (tid) query = query.eq('tid', String(tid));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function latestPreviousDeck(playerId, currentTid) {
    const id = normalizePlayerId(playerId);
    if (!id || !currentTid || !pairingClient || !pairingAuthorized) return null;

    const { data: current, error: currentError } = await pairingClient
      .from('pairing_deck_scouts')
      .select('tid,deck_name,created_at')
      .eq('user_id', currentUserId())
      .eq('tid', String(currentTid))
      .eq('player_id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (current?.deck_name) return null;

    const { data, error } = await pairingClient
      .from('pairing_deck_scouts')
      .select('tid,deck_name,created_at')
      .eq('user_id', currentUserId())
      .eq('player_id', id)
      .neq('tid', String(currentTid))
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }

  async function decoratePreviousDeck(detail) {
    const opponentId = normalizePlayerId(detail?.opponentId);
    const tid = String(detail?.data?.tid || '');
    const article = document.querySelector('#pairingResult .pairing-match-grid article:nth-child(3)');
    if (!article) return;
    article.querySelector('.pairing-scout-history')?.remove();
    if (!opponentId || !tid || !pairingAuthorized) return;

    try {
      const previous = await latestPreviousDeck(opponentId, tid);
      if (!previous?.deck_name) return;
      const badge = document.createElement('div');
      badge.className = 'pairing-scout-history';
      badge.innerHTML = `<span>歷史牌組情報</span><strong>${esc(formatShortDate(previous.created_at))}：${esc(previous.deck_name)}</strong><small>舊資料／僅供參考</small>`;
      article.appendChild(badge);
    } catch (error) {
      console.warn('歷史牌組情報讀取失敗', error);
    }
  }

  function buildDistribution(exact, pairs) {
    const counts = new Map();
    const countedPlayers = new Set();
    let ambiguousPairs = 0;
    const exactMap = new Map();
    const add = deck => {
      if (!deck) return;
      counts.set(deck, (counts.get(deck) || 0) + 1);
    };

    for (const row of exact) {
      const id = normalizePlayerId(row.player_id);
      if (!id) continue;
      exactMap.set(id, row.deck_name);
      if (countedPlayers.has(id)) continue;
      countedPlayers.add(id);
      add(row.deck_name);
    }

    for (const row of pairs) {
      const a = normalizePlayerId(row.player_a_id);
      const b = normalizePlayerId(row.player_b_id);
      if (!a || !b) continue;
      const aKnown = exactMap.get(a) || '';
      const bKnown = exactMap.get(b) || '';
      if (aKnown && bKnown) continue;

      if (aKnown && !bKnown && !countedPlayers.has(b)) {
        const decks = [row.deck_a, row.deck_b].filter(Boolean);
        const inferred = row.deck_a === row.deck_b ? row.deck_a : (decks.includes(aKnown) ? decks.find(deck => deck !== aKnown) : '');
        if (inferred) {
          add(inferred);
          countedPlayers.add(b);
          continue;
        }
      }

      if (bKnown && !aKnown && !countedPlayers.has(a)) {
        const decks = [row.deck_a, row.deck_b].filter(Boolean);
        const inferred = row.deck_a === row.deck_b ? row.deck_a : (decks.includes(bKnown) ? decks.find(deck => deck !== bKnown) : '');
        if (inferred) {
          add(inferred);
          countedPlayers.add(a);
          continue;
        }
      }

      if (!aKnown && !bKnown && !countedPlayers.has(a) && !countedPlayers.has(b)) {
        add(row.deck_a);
        add(row.deck_b);
        countedPlayers.add(a);
        countedPlayers.add(b);
        ambiguousPairs += 1;
      }
    }

    return {
      total: [...counts.values()].reduce((sum, value) => sum + value, 0),
      sorted: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')),
      ambiguousPairs
    };
  }

  function distributionHtml(exact, pairs) {
    const distribution = buildDistribution(exact, pairs);
    if (!distribution.total) return '<div class="pairing-scout-stats-empty">這場比賽沒有可顯示的牌組紀錄。</div>';

    let cursor = 0;
    const segments = distribution.sorted.map(([name, count], index) => {
      const start = cursor;
      cursor += count / distribution.total * 100;
      return `hsl(${(index * 67 + 210) % 360} 65% 56%) ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    const legend = distribution.sorted.map(([name, count], index) => {
      const pct = Math.round(count / distribution.total * 100);
      return `<div><i style="--dot:hsl(${(index * 67 + 210) % 360} 65% 56%)"></i><span>${esc(name)}</span><b>${count} · ${pct}%</b></div>`;
    }).join('');
    const note = distribution.ambiguousPairs ? `（含 ${distribution.ambiguousPairs} 桌未辨識）` : '';
    return `
      <div class="pairing-scout-stats-head"><strong>牌組分布</strong><span>已記錄 ${distribution.total} 位玩家${note}</span></div>
      <div class="pairing-scout-chart-wrap">
        <div class="pairing-scout-donut" style="background:conic-gradient(${segments.join(',')})"><span>${distribution.total}<small>人</small></span></div>
        <div class="pairing-scout-legend">${legend}</div>
      </div>`;
  }

  function firstSeen(rows) {
    return rows
      .map(row => new Date(row.created_at).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0] || 0;
  }

  function renderHistoryEvent(event) {
    return `
      <article class="pairing-history-event" data-history-event="${esc(event.tid)}">
        <div class="pairing-history-event-row">
          <div class="pairing-history-event-main">
            <strong>${esc(formatCompactDate(event.seen))}</strong>
            <span>TID ${esc(event.tid)}</span>
            <small>${event.total} 位玩家</small>
          </div>
          <div class="pairing-history-actions">
            <button type="button" class="secondary-btn" data-history-tid="${esc(event.tid)}">牌組分布</button>
            <a class="pairing-history-link" href="https://tcg.sfc-jpn.jp/tour.asp?tid=${encodeURIComponent(event.tid)}" target="_blank" rel="noopener noreferrer">官方 ↗</a>
          </div>
        </div>
        <div class="pairing-history-inline-detail" data-history-detail="${esc(event.tid)}" hidden></div>
      </article>`;
  }

  async function loadHistory() {
    const list = $('pairingHistoryList');
    const legacyDetail = $('pairingHistoryDetail');
    if (!list || !pairingAuthorized || !currentUserId()) return;
    list.innerHTML = '<div class="pairing-history-loading">正在讀取歷史賽事…</div>';
    if (legacyDetail) legacyDetail.innerHTML = '';

    try {
      const [allExact, allPairs] = await Promise.all([exactRows(), pairRows()]);
      const tids = [...new Set([...allExact.map(row => String(row.tid)), ...allPairs.map(row => String(row.tid))].filter(Boolean))];
      const events = tids.map(tid => {
        const exact = allExact.filter(row => String(row.tid) === tid);
        const pairs = allPairs.filter(row => String(row.tid) === tid);
        const seen = firstSeen([...exact, ...pairs]);
        const distribution = buildDistribution(exact, pairs);
        return { tid, exact, pairs, seen, total: distribution.total, season: seasonInfo(seen) };
      }).filter(event => event.seen).sort((a, b) => b.seen - a.seen);

      if (!events.length) {
        list.innerHTML = '<div class="pairing-history-empty">目前還沒有歷史賽事牌組紀錄。</div>';
        return;
      }

      const grouped = new Map();
      for (const event of events) {
        const key = event.season.key || 'unknown';
        if (!grouped.has(key)) grouped.set(key, { ...event.season, events: [] });
        grouped.get(key).events.push(event);
      }
      const seasons = [...grouped.values()].sort((a, b) => b.start - a.start);
      const currentKey = currentSeasonKey();
      const defaultOpenKey = seasons.some(item => item.key === currentKey) ? currentKey : seasons[0]?.key;

      list.innerHTML = seasons.map(season => `
        <details class="pairing-history-season" data-season="${esc(season.key)}" ${season.key === defaultOpenKey ? 'open' : ''}>
          <summary><strong>${esc(season.label)}</strong><span>${season.events.length} 場</span></summary>
          <div class="pairing-history-season-list">${season.events.map(renderHistoryEvent).join('')}</div>
        </details>`).join('');

      list.querySelectorAll('[data-history-tid]').forEach(button => {
        button.addEventListener('click', () => {
          const event = events.find(item => item.tid === button.dataset.historyTid);
          const article = button.closest('.pairing-history-event');
          const detail = article?.querySelector('[data-history-detail]');
          if (!event || !detail) return;

          const wasOpen = !detail.hidden;
          list.querySelectorAll('.pairing-history-inline-detail').forEach(other => {
            other.hidden = true;
            other.innerHTML = '';
          });
          list.querySelectorAll('[data-history-tid]').forEach(otherButton => {
            otherButton.textContent = '牌組分布';
          });
          if (wasOpen) return;

          detail.innerHTML = `<div class="pairing-scout-stats pairing-history-stats">${distributionHtml(event.exact, event.pairs)}</div>`;
          detail.hidden = false;
          button.textContent = '收合分布';
        });
      });
    } catch (error) {
      console.warn('歷史賽事讀取失敗', error);
      list.innerHTML = `<div class="pairing-history-empty">歷史賽事讀取失敗：${esc(error?.message || error)}</div>`;
    }
  }

  function deckNamesFromSelect(select) {
    return [...select.options]
      .map(option => String(option.value || '').trim())
      .filter(Boolean);
  }

  function closeDeckSearches(except = null) {
    document.querySelectorAll('.pairing-deck-search').forEach(wrapper => {
      if (except && wrapper === except) return;
      const list = wrapper.querySelector('.pairing-deck-search-results');
      const input = wrapper.querySelector('.pairing-deck-search-input');
      const select = wrapper.querySelector('select');
      if (list) list.hidden = true;
      if (input && select) input.value = select.value || '';
    });
  }

  function enhanceDeckSelect(select) {
    if (!select || select.dataset.deckSearchEnhanced === '1') return;
    select.dataset.deckSearchEnhanced = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'pairing-deck-search';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'pairing-deck-search-input';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.inputMode = 'search';
    input.enterKeyHint = 'done';
    input.placeholder = '可直接滑選，或輸入關鍵字搜尋';
    input.value = select.value || '';
    input.setAttribute('aria-label', '搜尋牌組');

    const results = document.createElement('div');
    results.className = 'pairing-deck-search-results';
    results.hidden = true;

    select.before(wrapper);
    wrapper.append(input, results, select);
    select.classList.add('pairing-deck-search-native');

    const render = () => {
      const query = input.value.trim().toLocaleLowerCase('zh-Hant');
      const matches = deckNamesFromSelect(select)
        .filter(name => !query || name.toLocaleLowerCase('zh-Hant').includes(query));
      if (!matches.length) {
        results.innerHTML = '<div class="pairing-deck-search-hint">找不到符合的牌組。</div>';
      } else {
        results.innerHTML = matches.map(name => `<button type="button" data-deck-search-value="${esc(name)}">${esc(name)}</button>`).join('');
      }
      results.hidden = false;
    };

    input.addEventListener('focus', () => {
      closeDeckSearches(wrapper);
      if (select.value && input.value === select.value) input.value = '';
      render();
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        results.hidden = true;
        input.value = select.value || '';
        input.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-deck-search-value]');
      if (!button || select.disabled) return;
      const value = button.dataset.deckSearchValue || '';
      if (!value) return;
      select.value = value;
      input.value = value;
      results.hidden = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });
    select.addEventListener('change', () => {
      input.value = select.value || '';
    });
  }

  function enhanceDeckSearches(root = document) {
    root.querySelectorAll('select[data-scout-player], #pairingScoutPairDeckA, #pairingScoutPairDeckB')
      .forEach(enhanceDeckSelect);
  }

  function initDeckSearches() {
    const scoutResult = $('pairingScoutResult');
    if (!scoutResult) return;
    enhanceDeckSearches(scoutResult);
    deckSearchObserver?.disconnect();
    deckSearchObserver = new MutationObserver(() => enhanceDeckSearches(scoutResult));
    deckSearchObserver.observe(scoutResult, { childList: true, subtree: true });
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.pairing-deck-search')) closeDeckSearches();
    });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (lastMatchDetail) decoratePreviousDeck(lastMatchDetail);
      if ($('pairingHistory')?.open) loadHistory();
    }, 800);
  }

  document.addEventListener('pairing:match-rendered', event => {
    lastMatchDetail = event.detail || null;
    decoratePreviousDeck(lastMatchDetail);
  });

  document.addEventListener('pairing:auth-ready', event => {
    if (!event.detail?.allowed) return;
    if ($('pairingHistory')?.open) loadHistory();
  });

  document.addEventListener('DOMContentLoaded', () => {
    $('pairingHistory')?.addEventListener('toggle', event => {
      if (event.currentTarget.open) loadHistory();
    });
    $('pairingDeckScout')?.addEventListener('change', scheduleRefresh);
    initDeckSearches();
  }, { once: true });
})();
