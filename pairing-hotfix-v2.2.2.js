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

      // TCG マイスター舊版表格在 PTCG ID 後方插入 TtlScore；
      // 桌號／No. 都位於 ID 前面，因此取 ID 後第一個純數字欄位最穩定。
      const score = cells.slice(idIndex + 1).find(cell => /^-?\d+(?:\.\d+)?$/.test(cell));
      if (score !== undefined) return score;
    }
    return '';
  }

  function decorateTtlScore(detail = {}) {
    const data = detail?.data || window.lastPairing;
    const grid = document.querySelector('#pairingResult .pairing-match-grid');
    if (!grid || !data?.match) return;

    grid.querySelector('.pairing-ttl-score-card')?.remove();
    const playerId = detail?.playerId || data.match.player;
    const score = matchTtlScore(data, playerId);
    if (score === '') return;

    const article = document.createElement('article');
    article.className = 'pairing-ttl-score-card';
    article.innerHTML = `<span>TtlScore</span><strong>${String(score).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</strong><small>官方目前累計分數</small>`;

    const sourceCard = [...grid.querySelectorAll(':scope > article')]
      .find(card => card.querySelector('span')?.textContent?.trim() === '來源');
    if (sourceCard) sourceCard.before(article);
    else grid.appendChild(article);
  }

  function refreshAll(detail = null) {
    decorateScoutBadges();
    if (detail) decorateTtlScore(detail);
  }

  document.addEventListener('pairing:match-rendered', event => {
    window.setTimeout(() => refreshAll(event.detail || {}), 0);
  });
  document.addEventListener('ptcg:attention-changed', () => window.setTimeout(decorateScoutBadges, 0));

  const observer = new MutationObserver(() => decorateScoutBadges());
  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    decorateScoutBadges();
    try {
      navigator.serviceWorker?.getRegistration('./')?.then(registration => registration?.update?.()).catch(() => {});
    } catch (_) {}
    for (const delay of [250, 800, 1600, 3000]) window.setTimeout(decorateScoutBadges, delay);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
