(() => {
  'use strict';

  if (window.__pairingV222HotfixLoaded) return;
  window.__pairingV222HotfixLoaded = true;

  function normalizePlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function scoutPlayerId(article) {
    return normalizePlayerId(article?.querySelector('small')?.textContent || article?.textContent || '');
  }

  function decorateScoutBadges() {
    const api = window.PTCGPlayerBadges;
    if (!api?.html) return;

    document.querySelectorAll('#pairingScoutResult .pairing-scout-player').forEach(article => {
      const playerId = scoutPlayerId(article);
      if (!playerId) return;
      const info = article.querySelector(':scope > div');
      if (!info) return;

      const html = api.html(playerId);
      let row = info.querySelector('.player-badge-row.pairing-scout-badge-row');
      if (!html) {
        row?.remove();
        return;
      }
      if (!row) {
        row = document.createElement('div');
        row.className = 'player-badge-row pairing-scout-badge-row';
        info.appendChild(row);
      }
      if (row.innerHTML !== html) row.innerHTML = html;
    });
  }

  function matchTtlScore(data, playerId) {
    const direct = data?.match?.ttl_score ?? data?.match?.ttlScore ?? data?.match?.TtlScore;
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim();

    const wanted = normalizePlayerId(playerId || data?.match?.player);
    if (!wanted) return '';
    for (const row of data?.matched_rows || []) {
      const cells = Array.isArray(row?.cells) ? row.cells.map(value => String(value ?? '').trim()) : [];
      const idIndex = cells.findIndex(cell => normalizePlayerId(cell) === wanted || cell.toLowerCase().includes(wanted));
      if (idIndex < 0) continue;

      // 舊版頁面 Round 2+ 會在玩家資料列加入 TtlScore。
      // 桌號與 No. 在 ID 前面，因此優先取 ID 後方的純數字欄位。
      const afterId = cells.slice(idIndex + 1).find(cell => /^-?\d+(?:\.\d+)?$/.test(cell));
      if (afterId !== undefined) return afterId;
    }
    return '';
  }

  function decorateTtlScore(detail = {}) {
    const data = detail?.data || window.lastPairing;
    const grid = document.querySelector('#pairingResult .pairing-match-grid');
    if (!grid || !data?.match) return;

    const playerId = detail?.playerId || data.match.player;
    const score = matchTtlScore(data, playerId);
    let article = grid.querySelector('.pairing-ttl-score-card');
    if (score === '') {
      article?.remove();
      return;
    }

    if (!article) {
      article = document.createElement('article');
      article.className = 'pairing-ttl-score-card';
      const sourceCard = [...grid.querySelectorAll(':scope > article')]
        .find(card => card.querySelector('span')?.textContent?.trim() === '來源');
      if (sourceCard) sourceCard.before(article);
      else grid.appendChild(article);
    }

    if (article.dataset.ttlScore === score) return;
    article.dataset.ttlScore = score;
    article.innerHTML = `<span>TtlScore</span><strong>${String(score).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</strong><small>官方目前累計分數</small>`;
  }

  function refreshAll(detail = {}) {
    decorateScoutBadges();
    decorateTtlScore(detail);
  }

  document.addEventListener('pairing:match-rendered', event => {
    window.setTimeout(() => refreshAll(event.detail || {}), 0);
  });
  document.addEventListener('ptcg:attention-changed', () => window.setTimeout(decorateScoutBadges, 0));
  document.addEventListener('pairing:auth-ready', () => window.setTimeout(refreshAll, 0));

  let refreshTimer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refreshAll(), 20);
  });

  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    refreshAll();
    try {
      navigator.serviceWorker?.getRegistration('./')?.then(registration => registration?.update?.()).catch(() => {});
    } catch (_) {}
    for (const delay of [250, 800, 1600, 3000, 5000]) window.setTimeout(refreshAll, delay);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
