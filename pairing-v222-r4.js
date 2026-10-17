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

  function installScoreLayoutStyle() {
    if (document.getElementById('pairingScoreLayoutV222')) return;
    const style = document.createElement('style');
    style.id = 'pairingScoreLayoutV222';
    style.textContent = `
      #pairingResult .pairing-match-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      #pairingResult .pairing-match-grid > .pairing-table-card {
        grid-column: 1 / -1;
        grid-row: 1;
      }
      #pairingResult .pairing-match-grid > .pairing-player-card {
        grid-column: 1;
        grid-row: 2;
      }
      #pairingResult .pairing-match-grid > .pairing-ttl-score-card {
        grid-column: 2;
        grid-row: 2;
      }
      #pairingResult .pairing-match-grid > .pairing-opponent-card {
        grid-column: 1;
        grid-row: 3;
      }
      #pairingResult .pairing-match-grid > .pairing-deck-card {
        grid-column: 2;
        grid-row: 3;
      }
      #pairingResult .pairing-match-grid > .pairing-source-card {
        grid-column: 1 / -1;
        grid-row: 4;
      }
      #pairingResult .pairing-deck-card strong {
        font-size: 15px;
      }
      #pairingResult .pairing-deck-card.is-known {
        background: #eef9f3;
      }
      #pairingResult .pairing-deck-card.is-possible {
        background: #fff8e8;
      }
      @media (max-width: 560px) {
        #pairingResult .pairing-match-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
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

  function classifyGridCards() {
    const grid = resultGrid();
    if (!grid) return {};
    const cards = {};
    for (const article of grid.querySelectorAll(':scope > article')) {
      if (article.classList.contains('pairing-ttl-score-card')) {
        cards.score = article;
        continue;
      }
      if (article.classList.contains('pairing-deck-card')) {
        cards.deck = article;
        continue;
      }
      const label = article.querySelector('span')?.textContent?.trim() || '';
      if (label === '桌號') {
        article.classList.add('pairing-table-card');
        cards.table = article;
      } else if (label === '你的玩家') {
        article.classList.add('pairing-player-card');
        cards.player = article;
      } else if (label === '對手') {
        article.classList.add('pairing-opponent-card');
        cards.opponent = article;
      } else if (label === '來源') {
        article.classList.add('pairing-source-card');
        cards.source = article;
      }
    }
    return cards;
  }

  function scoreCard() {
    return resultGrid()?.querySelector('.pairing-ttl-score-card') || null;
  }

  function deckCard() {
    return resultGrid()?.querySelector('.pairing-deck-card') || null;
  }

  function ensureDeckCard() {
    const grid = resultGrid();
    if (!grid) return null;
    installScoreLayoutStyle();
    const cards = classifyGridCards();
    let card = deckCard();
    if (!card) {
      card = document.createElement('article');
      card.className = 'pairing-deck-card';
      card.innerHTML = '<span>對手牌組</span><strong>尚未記錄</strong>';
    }
    if (cards.opponent && cards.opponent.nextElementSibling !== card) {
      cards.opponent.insertAdjacentElement('afterend', card);
    } else if (!card.isConnected) {
      const source = cards.source || [...grid.querySelectorAll(':scope > article')]
        .find(article => article.querySelector('span')?.textContent?.trim() === '來源');
      if (source) source.before(card);
      else grid.appendChild(card);
    }
    return card;
  }

  function syncOpponentDeckCard() {
    const grid = resultGrid();
    if (!grid) return false;
    const cards = classifyGridCards();
    const candidates = [
      cards.opponent?.querySelector('.pairing-scout-known'),
      scoreCard()?.querySelector('.pairing-scout-known'),
      ...[...grid.querySelectorAll(':scope > article .pairing-scout-known')]
    ].filter(Boolean);
    const badge = candidates[0];
    const card = ensureDeckCard();
    if (!card || !badge) return false;

    const text = String(badge.textContent || '').trim();
    let label = '對手牌組';
    let value = '尚未記錄';
    let state = '';
    if (badge.classList.contains('possible') || /^可能牌組/.test(text)) {
      label = '可能牌組';
      value = text.replace(/^可能牌組[：:]?\s*/, '') || '—';
      state = 'is-possible';
    } else if (badge.classList.contains('unknown') || /尚未記錄/.test(text)) {
      label = '對手牌組';
      value = '尚未記錄';
    } else if (text) {
      label = '已記錄牌組';
      value = text.replace(/^已記錄牌組[：:]?\s*/, '') || text;
      state = 'is-known';
    }

    card.classList.remove('is-known', 'is-possible');
    if (state) card.classList.add(state);
    card.innerHTML = `<span>${esc(label)}</span><strong>${esc(value)}</strong>`;
    badge.remove();
    return true;
  }

  function ensureScoreCard(value = '讀取中…', note = '正在讀取官方 TtlScore') {
    const grid = resultGrid();
    if (!grid) return null;
    installScoreLayoutStyle();
    const cards = classifyGridCards();
    ensureDeckCard();
    let card = scoreCard();
    if (!card) {
      card = document.createElement('article');
      card.className = 'pairing-ttl-score-card';
    }
    if (!card.isConnected) {
      const source = cards.source || [...grid.querySelectorAll(':scope > article')]
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
    installScoreLayoutStyle();
    decorateScoutBadges();
    classifyGridCards();
    if (resultGrid()) {
      ensureDeckCard();
      syncOpponentDeckCard();
      scheduleScore(false);
    }
  }

  document.addEventListener('pairing:match-rendered', () => {
    ensureDeckCard();
    scheduleScore(true);
    window.setTimeout(syncOpponentDeckCard, 120);
  });
  document.addEventListener('pairing:auth-ready', () => {
    window.PTCGPlayerBadges?.refreshAttention?.();
    window.setTimeout(decorateScoutBadges, 60);
    window.setTimeout(syncOpponentDeckCard, 120);
    scheduleScore(false);
  });
  document.addEventListener('ptcg:attention-changed', () => window.setTimeout(decorateScoutBadges, 0));

  const observer = new MutationObserver(() => {
    window.setTimeout(() => {
      decorateScoutBadges();
      classifyGridCards();
      syncOpponentDeckCard();
    }, 0);
    if (resultGrid() && !scoreCard()) scheduleScore(false);
  });

  function start() {
    installScoreLayoutStyle();
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
