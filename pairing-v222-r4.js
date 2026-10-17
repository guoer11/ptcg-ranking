(() => {
  'use strict';

  if (window.__pairingV222R4Loaded) return;
  window.__pairingV222R4Loaded = true;

  const SCORE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-score';
  let scoreTimer = 0;
  let scoreRequestKey = '';
  let scoreRequestSerial = 0;

  function normalizePlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? match[0].toLowerCase() : '';
  }

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function scoutArticles() {
    return [...document.querySelectorAll('#pairingScoutResult .pairing-scout-player')];
  }

  function decorateScoutBadges() {
    const api = window.PTCGPlayerBadges;
    if (!api?.html) return false;

    let changed = false;
    for (const article of scoutArticles()) {
      const info = article.firstElementChild;
      if (!info) continue;
      const playerId = normalizePlayerId(info.querySelector('small')?.textContent || info.textContent || '');
      if (!playerId) continue;

      const html = api.html(playerId);
      let row = info.querySelector('.pairing-scout-badge-row');
      if (!html) {
        if (row) {
          row.remove();
          changed = true;
        }
        continue;
      }
      if (!row) {
        row = document.createElement('div');
        row.className = 'player-badge-row pairing-scout-badge-row';
        const possible = info.querySelector('.pairing-scout-player-possible');
        if (possible) possible.before(row);
        else info.appendChild(row);
        changed = true;
      }
      if (row.innerHTML !== html) {
        row.innerHTML = html;
        changed = true;
      }
    }
    return changed;
  }

  function resultGrid() {
    return document.querySelector('#pairingResult .pairing-match-grid');
  }

  function scoreCard() {
    return resultGrid()?.querySelector('.pairing-ttl-score-card') || null;
  }

  function ensureScoreCard(value = '讀取中…', note = '正在讀取官方 TtlScore') {
    const grid = resultGrid();
    if (!grid) return null;
    let card = scoreCard();
    if (!card) {
      card = document.createElement('article');
      card.className = 'pairing-ttl-score-card';
      const source = [...grid.querySelectorAll(':scope > article')]
        .find(article => article.querySelector('span')?.textContent?.trim() === '來源');
      if (source) source.before(card);
      else grid.appendChild(card);
    }
    card.innerHTML = `<span>TtlScore</span><strong>${esc(value)}</strong><small>${esc(note)}</small>`;
    return card;
  }

  function currentScoreContext() {
    const grid = resultGrid();
    if (!grid) return null;
    const sourceInput = document.getElementById('pairingSourceUrl');
    const playerInput = document.getElementById('pairingPlayerId');
    const roundInput = document.getElementById('pairingRound');
    const player = normalizePlayerId(playerInput?.value || '');
    const round = Number(roundInput?.value || 0);
    if (!sourceInput?.value || !player || !Number.isInteger(round) || round < 1) return null;

    try {
      const url = new URL(sourceInput.value.trim());
      if (url.hostname !== 'tcg.sfc-jpn.jp') return null;
      if (/\/tour\.asp$/i.test(url.pathname)) url.pathname = url.pathname.replace(/tour\.asp$/i, 'tourround.asp');
      if (!/\/tourround\.asp$/i.test(url.pathname)) return null;
      url.protocol = 'https:';
      url.searchParams.set('kno', String(round));
      url.searchParams.set('znt', url.searchParams.get('znt') || '0');
      return { url: url.toString(), player, round, key: `${url.toString()}|${player}` };
    } catch (_) {
      return null;
    }
  }

  async function loadTtlScore(force = false) {
    const context = currentScoreContext();
    if (!context) return false;
    if (!force && scoreRequestKey === context.key && scoreCard()?.dataset.scoreLoaded === '1') return true;

    const serial = ++scoreRequestSerial;
    scoreRequestKey = context.key;
    const card = ensureScoreCard();
    if (card) card.dataset.scoreLoaded = '0';

    try {
      const headers = { 'Content-Type': 'application/json' };
      try {
        if (typeof pairingSession !== 'undefined' && pairingSession?.access_token) {
          headers.Authorization = `Bearer ${pairingSession.access_token}`;
        }
      } catch (_) {}

      const response = await fetch(SCORE_URL, {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({ url: context.url, player: context.player })
      });
      const data = await response.json().catch(() => ({}));
      if (serial !== scoreRequestSerial || currentScoreContext()?.key !== context.key) return false;
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'TtlScore 讀取失敗');

      const value = data?.ttl_score;
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        const finalCard = ensureScoreCard(String(value).trim(), '官方目前累計分數');
        if (finalCard) finalCard.dataset.scoreLoaded = '1';
        return true;
      }

      const finalCard = ensureScoreCard('—', '官方頁目前未取得 TtlScore');
      if (finalCard) finalCard.dataset.scoreLoaded = '1';
      return false;
    } catch (error) {
      if (serial !== scoreRequestSerial) return false;
      const finalCard = ensureScoreCard('—', error?.message || 'TtlScore 讀取失敗');
      if (finalCard) finalCard.dataset.scoreLoaded = '1';
      return false;
    }
  }

  function scheduleScore(force = false) {
    clearTimeout(scoreTimer);
    scoreTimer = window.setTimeout(() => loadTtlScore(force), 80);
  }

  function refresh() {
    decorateScoutBadges();
    if (resultGrid()) scheduleScore(false);
  }

  document.addEventListener('pairing:match-rendered', () => scheduleScore(true));
  document.addEventListener('pairing:auth-ready', () => {
    window.PTCGPlayerBadges?.refreshAttention?.();
    window.setTimeout(decorateScoutBadges, 60);
    scheduleScore(false);
  });
  document.addEventListener('ptcg:attention-changed', () => window.setTimeout(decorateScoutBadges, 0));

  const observer = new MutationObserver(() => {
    window.setTimeout(decorateScoutBadges, 0);
    if (resultGrid() && !scoreCard()) scheduleScore(false);
  });

  function start() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    refresh();
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      refresh();
      if (count >= 45) window.clearInterval(timer);
    }, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
