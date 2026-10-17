(() => {
  'use strict';

  // r3 uses its own guard so an older cached hotfix cannot block this revision.
  if (window.__pairingV222HotfixR3Loaded) return;
  window.__pairingV222HotfixR3Loaded = true;

  function normalizePlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function scoutPlayerId(article) {
    const info = article?.firstElementChild;
    return normalizePlayerId(info?.querySelector('small')?.textContent || article?.textContent || '');
  }

  function decorateScoutBadges() {
    const api = window.PTCGPlayerBadges;
    if (!api?.html) return false;

    let decorated = false;
    document.querySelectorAll('#pairingScoutResult .pairing-scout-player').forEach(article => {
      const playerId = scoutPlayerId(article);
      if (!playerId) return;
      const info = article.firstElementChild;
      if (!info) return;

      const html = api.html(playerId);
      let row = info.querySelector('.pairing-scout-badge-row');
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
      decorated = true;
    });
    return decorated;
  }

  function matchTtlScore(data, playerId) {
    const direct = data?.match?.ttl_score ?? data?.match?.ttlScore ?? data?.match?.TtlScore ?? data?.match?.player_score;
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim();

    const wanted = normalizePlayerId(playerId || data?.match?.player);
    if (!wanted) return '';
    for (const row of data?.matched_rows || []) {
      const cells = Array.isArray(row?.cells) ? row.cells.map(value => String(value ?? '').trim()) : [];
      const idIndex = cells.findIndex(cell => normalizePlayerId(cell) === wanted || cell.toLowerCase().includes(wanted));
      if (idIndex < 0) continue;
      const nextIdOffset = cells.slice(idIndex + 1).findIndex(cell => /tw\d+/i.test(cell));
      const end = nextIdOffset >= 0 ? idIndex + 1 + nextIdOffset : cells.length;
      const score = cells.slice(idIndex + 1, end)
        .map(cell => cell.match(/^-?\d+(?:\.\d+)?/)?.[0] || '')
        .find(Boolean);
      if (score) return score;
    }
    return '';
  }

  function decorateTtlScore(detail = {}) {
    const data = detail?.data || window.lastPairing;
    const grid = document.querySelector('#pairingResult .pairing-match-grid');
    if (!grid || !data?.match) return false;

    const playerId = detail?.playerId || data.match.player;
    const score = matchTtlScore(data, playerId);
    let article = grid.querySelector('.pairing-ttl-score-card');
    if (score === '') {
      article?.remove();
      return false;
    }

    if (!article) {
      article = document.createElement('article');
      article.className = 'pairing-ttl-score-card';
      const sourceCard = [...grid.querySelectorAll('article')]
        .find(card => card.querySelector('span')?.textContent?.trim() === '來源');
      if (sourceCard) sourceCard.before(article);
      else grid.appendChild(article);
    }

    if (article.dataset.ttlScore !== score) {
      article.dataset.ttlScore = score;
      article.innerHTML = `<span>TtlScore</span><strong>${String(score).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</strong><small>官方目前累計分數</small>`;
    }
    return true;
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
    refreshTimer = window.setTimeout(() => refreshAll(), 30);
  });

  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    refreshAll();

    // PWA/Safari may finish loading badge JSON after the scout DOM is already visible.
    // Keep retrying briefly so the badge appears without requiring another lookup.
    let retries = 0;
    const retryTimer = window.setInterval(() => {
      retries += 1;
      refreshAll();
      if (retries >= 30) window.clearInterval(retryTimer);
    }, 1000);

    try {
      navigator.serviceWorker?.getRegistration('./')?.then(registration => registration?.update?.()).catch(() => {});
    } catch (_) {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
