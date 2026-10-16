(() => {
  const DATA_URL = 'data/player_badges.json?v=2.2.0-r1';
  const WCS_SOURCE_URL = 'ranking-season-ui.js?v=2.1.0-r3';
  const FAMILY_BADGE_STORAGE_KEY = 'ptcgFamilyBadgeContextV1';
  const FAMILY_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

  let badgeData = { season: '2026-27', great_window_days: 60, players: {} };
  let attentionSet = new Set();
  let attentionUserId = '';
  let wcsIconSrc = '';
  let publicReady = false;
  let authRetryTimer = 0;
  let decorateTimer = 0;

  function normalizeId(value) {
    return String(value || '').trim().toLowerCase();
  }

  function extractPlayerId(value) {
    const match = String(value || '').match(/tw\d+/i);
    return match ? normalizeId(match[0]) : '';
  }

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function playerInfo(playerId) {
    const id = normalizeId(playerId);
    return badgeData?.players?.[id] || {};
  }

  function rankLabel(rank) {
    return Number(rank) === 1 ? '冠軍' : Number(rank) === 2 ? '亞軍' : '';
  }

  function ballBadgeHtml(type, rank) {
    const numericRank = Number(rank);
    if (numericRank !== 1 && numericRank !== 2) return '';
    const labels = {
      premier: '紀念球',
      ultra: '高級球',
      great: '超級球'
    };
    const label = labels[type] || '';
    const range = type === 'great' ? '近60天' : '本賽季';
    return `<span class="player-ball-badge player-ball-${type}" title="${label}｜${range}${rankLabel(numericRank)}" aria-label="${label}${rankLabel(numericRank)}">
      <span class="player-ball-icon" aria-hidden="true"></span><span class="player-ball-rank">${numericRank}</span>
    </span>`;
  }

  function wcsBadgeHtml() {
    const label = '2025-2026 世界賽選手';
    if (wcsIconSrc) {
      return `<span class="player-badge-wcs" title="${label}" aria-label="${label}" role="img"><img src="${wcsIconSrc}" alt="" /></span>`;
    }
    return `<span class="player-badge-wcs player-badge-wcs-fallback" title="${label}" aria-label="${label}">WCS</span>`;
  }

  function attentionHtml(active, interactive = false, playerId = '') {
    if (interactive) {
      const label = active ? '取消注意標記' : '標記為注意選手';
      return `<button class="player-attention-toggle${active ? ' is-active' : ''}" type="button" data-player-attention-toggle="${esc(normalizeId(playerId))}" title="${label}" aria-label="${label}">${active ? '★' : '☆'}</button>`;
    }
    return active ? '<span class="player-attention-star is-active" title="注意名單" aria-label="注意名單">★</span>' : '';
  }

  function badgesHtml(playerId, options = {}) {
    const id = normalizeId(playerId);
    if (!id) return '';
    const info = playerInfo(id);
    const forcedAttention = options.attentionOverride;
    const attention = typeof forcedAttention === 'boolean' ? forcedAttention : attentionSet.has(id);
    const interactiveAttention = Boolean(options.interactiveAttention);
    const skipWcs = Boolean(options.skipWcs);
    const parts = [];

    if (!skipWcs && info.wcs_2026) parts.push(wcsBadgeHtml());
    if (attention || interactiveAttention) parts.push(attentionHtml(attention, interactiveAttention, id));
    if (info.premier) parts.push(ballBadgeHtml('premier', info.premier.best_rank));
    if (info.ultra) parts.push(ballBadgeHtml('ultra', info.ultra.best_rank));
    if (info.great) parts.push(ballBadgeHtml('great', info.great.best_rank));
    return parts.filter(Boolean).join('');
  }

  function badgeSignature(playerId, options = {}) {
    const id = normalizeId(playerId);
    const info = playerInfo(id);
    const forcedAttention = options.attentionOverride;
    const attention = typeof forcedAttention === 'boolean' ? forcedAttention : attentionSet.has(id);
    return [
      id,
      info.wcs_2026 ? 1 : 0,
      Number(info.premier?.best_rank || 0),
      Number(info.ultra?.best_rank || 0),
      Number(info.great?.best_rank || 0),
      attention ? 1 : 0,
      options.interactiveAttention ? 1 : 0,
      wcsIconSrc ? 1 : 0
    ].join('|');
  }

  function legendHtml() {
    return `<div class="player-badge-legend">
      <strong>標記說明</strong>
      <span class="player-badge-legend-line">WCS Logo＝世界賽選手　<span class="player-attention-star is-active" aria-hidden="true">★</span>＝注意名單</span>
      <span class="player-badge-legend-line"><b>¹</b>＝冠軍　<b>²</b>＝亞軍；超級球看近60天，高級球／紀念球看本賽季</span>
    </div>`;
  }

  async function loadWcsIcon() {
    if (wcsIconSrc) return;
    try {
      const cached = sessionStorage.getItem('ptcgWcs2026IconDataV1');
      if (cached?.startsWith('data:image/')) {
        wcsIconSrc = cached;
        return;
      }
    } catch (_) {}

    try {
      const response = await fetch(WCS_SOURCE_URL, { cache: 'force-cache' });
      if (!response.ok) return;
      const text = await response.text();
      const match = text.match(/<img src="(data:image\/webp;base64,[^"]+)"/i);
      if (!match?.[1]) return;
      wcsIconSrc = match[1];
      try { sessionStorage.setItem('ptcgWcs2026IconDataV1', wcsIconSrc); } catch (_) {}
    } catch (error) {
      console.warn('WCS 圖示讀取失敗', error);
    }
  }

  async function loadPublicBadges() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`player badges HTTP ${response.status}`);
      const data = await response.json();
      if (data?.players && typeof data.players === 'object') badgeData = data;
    } catch (error) {
      console.warn('玩家標記資料讀取失敗', error);
    } finally {
      publicReady = true;
    }
  }

  function currentAuthContext() {
    try {
      if (typeof identityClient !== 'undefined' && identityClient && typeof identitySession !== 'undefined' && identitySession?.user?.id) {
        return { client: identityClient, session: identitySession };
      }
    } catch (_) {}
    try {
      if (typeof pairingClient !== 'undefined' && pairingClient && typeof pairingSession !== 'undefined' && pairingSession?.user?.id) {
        return { client: pairingClient, session: pairingSession };
      }
    } catch (_) {}
    return null;
  }

  async function refreshAttentionMarks() {
    const auth = currentAuthContext();
    const userId = String(auth?.session?.user?.id || '');
    if (!auth?.client || !userId) {
      attentionSet = new Set();
      attentionUserId = '';
      scheduleDecorate();
      return false;
    }
    if (attentionUserId === userId && attentionSet.size >= 0) {
      // Still refresh to pick up changes from another signed-in device.
    }
    try {
      const { data, error } = await auth.client
        .from('player_attention_marks')
        .select('player_id')
        .eq('user_id', userId);
      if (error) throw error;
      attentionSet = new Set((data || []).map(row => normalizeId(row.player_id)).filter(Boolean));
      attentionUserId = userId;
      scheduleDecorate();
      return true;
    } catch (error) {
      console.warn('注意名單讀取失敗', error);
      return false;
    }
  }

  function startAuthRetry() {
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      const auth = currentAuthContext();
      if (auth?.session?.user?.id) {
        await refreshAttentionMarks();
        return;
      }
      if (attempts < 20) authRetryTimer = window.setTimeout(check, 350);
    };
    check();
  }

  async function toggleAttention(playerId) {
    const id = normalizeId(playerId);
    const auth = currentAuthContext();
    const userId = String(auth?.session?.user?.id || '');
    if (!id || !auth?.client || !userId) throw new Error('請先登入帳號後再使用注意標記');

    const active = attentionSet.has(id);
    if (active) {
      const { error } = await auth.client
        .from('player_attention_marks')
        .delete()
        .eq('user_id', userId)
        .eq('player_id', id);
      if (error) throw error;
      attentionSet.delete(id);
    } else {
      const { error } = await auth.client
        .from('player_attention_marks')
        .upsert({ user_id: userId, player_id: id, updated_at: new Date().toISOString() }, { onConflict: 'user_id,player_id' });
      if (error) throw error;
      attentionSet.add(id);
    }
    attentionUserId = userId;
    scheduleDecorate();
    document.dispatchEvent(new CustomEvent('ptcg:attention-changed', { detail: { playerId: id, active: !active } }));
    return !active;
  }

  function ensureLegend(id, target, position = 'afterend') {
    if (!target) return;
    let legend = document.getElementById(id);
    if (!legend) {
      legend = document.createElement('div');
      legend.id = id;
      legend.innerHTML = legendHtml();
      target.insertAdjacentElement(position, legend);
    }
  }

  function decorateRanking() {
    const container = document.getElementById('rankingContainer');
    if (!container) return;
    const rows = [...container.querySelectorAll('.ranking-table tbody tr')].filter(row => !row.classList.contains('world-cut-line'));
    for (const row of rows) {
      const playerCell = row.querySelector('td:nth-child(2)');
      if (!playerCell) continue;
      const id = extractPlayerId(playerCell.querySelector('.row-id')?.textContent || playerCell.textContent);
      if (!id) continue;

      let badgeRow = playerCell.querySelector(':scope > .player-badge-row');
      const legacyWcs = playerCell.querySelector('.player-id-line > .wcs-id-icon');
      if (legacyWcs) legacyWcs.remove();
      const generated = badgesHtml(id);
      const signature = badgeSignature(id);
      if (!generated) {
        badgeRow?.remove();
        continue;
      }
      if (!badgeRow) {
        badgeRow = document.createElement('div');
        badgeRow.className = 'player-badge-row';
        playerCell.appendChild(badgeRow);
      }
      if (badgeRow.dataset.badgeSignature !== signature) {
        badgeRow.innerHTML = generated;
        badgeRow.dataset.badgeSignature = signature;
      }
    }
    ensureLegend('rankingBadgeLegend', container, 'afterend');
  }

  function findPairingArticle(label) {
    return [...document.querySelectorAll('#pairingResult .pairing-match-grid article')]
      .find(article => article.querySelector('span')?.textContent?.trim() === label) || null;
  }

  function renderArticleBadges(article, playerId, options = {}) {
    if (!article || !playerId) return;
    const generated = badgesHtml(playerId, options);
    const signature = badgeSignature(playerId, options);
    let row = article.querySelector('.player-badge-row');
    if (!generated) {
      row?.remove();
      return;
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'player-badge-row';
      article.appendChild(row);
    }
    if (row.dataset.badgeSignature !== signature) {
      row.innerHTML = generated;
      row.dataset.badgeSignature = signature;
    }
  }

  function decoratePairing(detail = null) {
    const result = document.getElementById('pairingResult');
    if (!result?.querySelector('.pairing-match-grid')) return;
    const playerArticle = findPairingArticle('你的玩家');
    const opponentArticle = findPairingArticle('對手');
    const playerId = normalizeId(detail?.playerId) || extractPlayerId(playerArticle?.textContent);
    const opponentId = normalizeId(detail?.opponentId) || extractPlayerId(opponentArticle?.textContent);
    if (playerId) renderArticleBadges(playerArticle, playerId);
    if (opponentId) renderArticleBadges(opponentArticle, opponentId, { interactiveAttention: Boolean(currentAuthContext()) });
    ensureLegend('pairingBadgeLegend', result, 'afterend');
  }

  function readFamilyContext() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') || '';
    if (type === 'round' || type === 'final') {
      const context = {
        type,
        player_id: normalizeId(params.get('player_id')) || extractPlayerId(params.get('player')),
        opponent_id: normalizeId(params.get('opponent_id')) || extractPlayerId(params.get('opponent')),
        opponent_attention: params.get('opponent_attention') === '1',
        saved_at: new Date().toISOString()
      };
      try { localStorage.setItem(FAMILY_BADGE_STORAGE_KEY, JSON.stringify(context)); } catch (_) {}
      return context;
    }
    try {
      const raw = localStorage.getItem(FAMILY_BADGE_STORAGE_KEY);
      if (!raw) return null;
      const context = JSON.parse(raw);
      const savedAt = Date.parse(context?.saved_at || '');
      if (!Number.isFinite(savedAt) || Date.now() - savedAt >= FAMILY_BADGE_TTL_MS) {
        localStorage.removeItem(FAMILY_BADGE_STORAGE_KEY);
        return null;
      }
      return context;
    } catch (_) {
      return null;
    }
  }

  function findFamilyArticle(label) {
    return [...document.querySelectorAll('#familyMatchGrid article')]
      .find(article => article.querySelector('span')?.textContent?.trim() === label) || null;
  }

  function decorateFamily() {
    const summary = document.getElementById('familyMatchSummary');
    if (!summary || summary.hidden) return;
    const context = readFamilyContext();
    if (!context) return;
    const playerArticle = findFamilyArticle('玩家');
    if (context.player_id) renderArticleBadges(playerArticle, context.player_id);
    if (context.type === 'round') {
      const opponentArticle = findFamilyArticle('對手');
      if (context.opponent_id) renderArticleBadges(opponentArticle, context.opponent_id, { attentionOverride: Boolean(context.opponent_attention) });
    }
    ensureLegend('familyBadgeLegend', summary, 'afterend');
  }

  function modalPlayerId() {
    const body = document.getElementById('playerModalBody');
    if (!body) return '';
    return extractPlayerId(body.querySelector('.player-id-value')?.textContent || document.getElementById('playerModalTitle')?.textContent || body.textContent);
  }

  function decoratePlayerModal() {
    const modal = document.getElementById('playerModal');
    const body = document.getElementById('playerModalBody');
    if (!modal?.classList.contains('open') || !body || body.querySelector('.modal-loading')) return;
    const id = modalPlayerId();
    if (!id) return;
    const auth = currentAuthContext();
    const infoHtml = badgesHtml(id);
    if (!auth && !infoHtml) return;

    let box = body.querySelector('.player-badge-modal-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'player-badge-modal-box';
      const anchor = body.querySelector('.player-stat-grid') || body.firstElementChild;
      if (anchor) anchor.insertAdjacentElement('beforebegin', box);
      else body.prepend(box);
    }
    const modalHtml = `<div class="player-badge-row">${infoHtml}</div>${auth ? `<button class="player-attention-modal-control${attentionSet.has(id) ? ' is-active' : ''}" type="button" data-player-attention-toggle="${esc(id)}">${attentionSet.has(id) ? '★ 已標記注意' : '☆ 標記注意'}</button>` : ''}`;
    const modalSignature = `${badgeSignature(id)}|${auth ? 1 : 0}`;
    if (box.dataset.badgeSignature !== modalSignature) {
      box.innerHTML = modalHtml;
      box.dataset.badgeSignature = modalSignature;
    }
  }

  function decorateAll() {
    decorateRanking();
    decoratePairing();
    decorateFamily();
    decoratePlayerModal();
  }

  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = window.setTimeout(decorateAll, 40);
  }

  function installObservers() {
    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    document.addEventListener('pairing:match-rendered', event => {
      window.setTimeout(() => decoratePairing(event.detail || {}), 0);
    });
    document.addEventListener('pairing:auth-ready', () => {
      refreshAttentionMarks();
      scheduleDecorate();
    });
    document.addEventListener('click', async event => {
      const button = event.target.closest?.('[data-player-attention-toggle]');
      if (!button) return;
      const id = normalizeId(button.getAttribute('data-player-attention-toggle'));
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await toggleAttention(id);
      } catch (error) {
        console.error('注意標記更新失敗', error);
        window.alert(error?.message || '注意標記更新失敗');
      } finally {
        button.disabled = false;
      }
    });
  }

  async function init() {
    installObservers();
    await Promise.all([loadPublicBadges(), loadWcsIcon()]);
    startAuthRetry();
    scheduleDecorate();
  }

  window.PTCGPlayerBadges = {
    get data() { return badgeData; },
    get ready() { return publicReady; },
    html: badgesHtml,
    legendHtml,
    isAttention: playerId => attentionSet.has(normalizeId(playerId)),
    refreshAttention: refreshAttentionMarks,
    toggleAttention,
    refresh: scheduleDecorate
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
