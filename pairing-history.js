(() => {
  'use strict';

  if (window.__pairingHistoryLoaded) return;
  window.__pairingHistoryLoaded = true;

  const $ = id => document.getElementById(id);
  let lastMatchDetail = null;
  let refreshTimer = null;

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

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric'
    }).format(date);
  }

  function formatFullDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
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

  async function loadHistory() {
    const list = $('pairingHistoryList');
    const detail = $('pairingHistoryDetail');
    if (!list || !pairingAuthorized || !currentUserId()) return;
    list.innerHTML = '<div class="pairing-history-loading">正在讀取歷史賽事…</div>';
    if (detail) detail.innerHTML = '';

    try {
      const [allExact, allPairs] = await Promise.all([exactRows(), pairRows()]);
      const tids = [...new Set([...allExact.map(row => String(row.tid)), ...allPairs.map(row => String(row.tid))].filter(Boolean))];
      const events = tids.map(tid => {
        const exact = allExact.filter(row => String(row.tid) === tid);
        const pairs = allPairs.filter(row => String(row.tid) === tid);
        const seen = firstSeen([...exact, ...pairs]);
        const distribution = buildDistribution(exact, pairs);
        return { tid, exact, pairs, seen, total: distribution.total };
      }).filter(event => event.seen).sort((a, b) => b.seen - a.seen);

      if (!events.length) {
        list.innerHTML = '<div class="pairing-history-empty">目前還沒有歷史賽事牌組紀錄。</div>';
        return;
      }

      list.innerHTML = events.map(event => `
        <article class="pairing-history-event">
          <div>
            <strong>${esc(formatFullDate(event.seen))}</strong>
            <span>TCG マイスター · TID ${esc(event.tid)}</span>
            <small>已記錄 ${event.total} 位玩家</small>
          </div>
          <div class="pairing-history-actions">
            <button type="button" class="secondary-btn" data-history-tid="${esc(event.tid)}">查看牌組分布</button>
            <a class="pairing-history-link" href="https://tcg.sfc-jpn.jp/tour.asp?tid=${encodeURIComponent(event.tid)}" target="_blank" rel="noopener noreferrer">官方頁 ↗</a>
          </div>
        </article>`).join('');

      list.querySelectorAll('[data-history-tid]').forEach(button => {
        button.addEventListener('click', () => {
          const event = events.find(item => item.tid === button.dataset.historyTid);
          if (!event || !detail) return;
          detail.innerHTML = `
            <div class="pairing-history-detail-head">
              <div><strong>${esc(formatFullDate(event.seen))}</strong><span>TID ${esc(event.tid)}</span></div>
              <button type="button" class="pairing-history-close" aria-label="關閉歷史牌組分布">×</button>
            </div>
            <div class="pairing-scout-stats pairing-history-stats">${distributionHtml(event.exact, event.pairs)}</div>`;
          detail.querySelector('.pairing-history-close')?.addEventListener('click', () => { detail.innerHTML = ''; });
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
    } catch (error) {
      console.warn('歷史賽事讀取失敗', error);
      list.innerHTML = `<div class="pairing-history-empty">歷史賽事讀取失敗：${esc(error?.message || error)}</div>`;
    }
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
  }, { once: true });
})();
