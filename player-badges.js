(() => {
  const DATA_URL = 'data/player_badges.json?v=2.2.0-r2';
  const WCS_SOURCE_URL = 'ranking-season-ui.js?v=2.1.0-r3';
  const WCS_2027_URL = 'data/wcs_2027_invites.json?v=2.8.0-r1';
  const FAMILY_BADGE_STORAGE_KEY = 'ptcgFamilyBadgeContextV1';
  const FAMILY_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

  let badgeData = { season: '2026-27', great_window_days: 60, players: {} };
  // 內建已核對資格名單，避免獨立 JSON 暫時讀不到時，排行榜與詳細資料標記一起消失。
  // 外部 JSON 成功載入後仍以 JSON 為準，後續可追加其他賽事資格。
  let wcs2027 = {
    "season": "2026-27",
    "worlds_year": 2027,
    "source": "2026–27 紀念球聯盟賽（使用者提供的四強與冠亞軍對戰表）",
    "players": {
      "tw35477925": {
        "name": "李育帆",
        "group": "Master",
        "rank": 1,
        "place": "冠軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw18638755": {
        "name": "劉仕晟",
        "group": "Master",
        "rank": 2,
        "place": "亞軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw59096586": {
        "name": "吳明峰",
        "group": "Master",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw42912360": {
        "name": "謝秉辰",
        "group": "Master",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw65322738": {
        "name": "許雲翔",
        "group": "Senior",
        "rank": 1,
        "place": "冠軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw03103631": {
        "name": "顏紹同",
        "group": "Senior",
        "rank": 2,
        "place": "亞軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw81124094": {
        "name": "李宥緯",
        "group": "Senior",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw13175197": {
        "name": "陳永恩",
        "group": "Senior",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw46877625": {
        "name": "陳鉑岳",
        "group": "Junior",
        "rank": 1,
        "place": "冠軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw25007020": {
        "name": "許辰銨",
        "group": "Junior",
        "rank": 2,
        "place": "亞軍",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw75543412": {
        "name": "吳季東",
        "group": "Junior",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      },
      "tw63041398": {
        "name": "楊子霆",
        "group": "Junior",
        "rank": 4,
        "place": "四強",
        "event": "2026–27 紀念球聯盟賽",
        "status": "invited"
      }
    }
  };
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
    const range = type === 'great' ? '自該次冠／亞軍日起60天內' : '本賽季';
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

  function wcs2027Info(playerId) {
    return wcs2027?.players?.[normalizeId(playerId)] || null;
  }

  function wcs2027BadgeHtml(playerId) {
    const info = wcs2027Info(playerId);
    if (!info) return '';
    const label = `WCS 2027 邀請資格｜${info.event}｜${info.place}`;
    return `<span class="player-badge-wcs-2027" title="${esc(label)}" aria-label="${esc(label)}" role="img"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAMAAAC5zwKfAAAAwFBMVEXW6OgJ4t3fph0GYZQVUGkHoNf02FgOLlBUXmUlLS8NmKWo4OBX4+fx7J780ildVi8AtLUC5tuachgE4NqZpKumnVUF3tevjyjVuEwDybllmaMDcXPEeQABEjYA9rUGDlwFDjlhdYcEFTU7QTauu8MAtskA/3+v26pEOh9arMWFe0UFJUQAcpwAf/////8AAP8DeYgCsbQCvcVff39/v78AAAAFFjD5/PwACCgD//8BOG4EJ04UJTT6xi72uBUAABsjbUERAAAAQHRSTlP98/z8/P38/P34/fz9/f38CZ/8Y/39J/z87PwG/J0HCxL9W/38IgL9/f39awYCAQGobVkIBAD8/fwD/Pz8/f37dmxH9AAACDBJREFUeNrtmAlzqkoWx4FuaBoEFCVu1yRmubnLmzcrbUODfP9v9f6nIY5JJOObpWpqak4lKiA/z96Hdsp/szj/B/4vAe/+mzSsBnlz8uH+nwNup9M/nMDT6Ql6rx7K+98NrCoL2z4/P9/cPP/SQ4l5X+7M7qIbnU9xeHmez2buq8zmN/35u3tZNPe/02TgpnOC+RFjnDMW+QSdT0nBBxHwizaPArcVcIAxIbRWBqLwLhigs5vybhc6P+T9heRxxtUDLgJMsM1kkA2j48hluyYLDkGmdvfXajgtn2duZHA3gRirv09qxugzfsOEReIcDofEyxDqq4AVqcc1J9hkUtc1wHitcYjzJstXgXNIVsus2ZX3d/8YSLxIGX/iMxNNeM15zSa1qI2ZRDWzjs0SJ9Na7+637/zoXLR35jIN1ZgwfMIMUIJNbJQnE+B83/VlslKbzZ4b/c6PziXeHOZGyBDcDqcRwMaE8sd3yXTmNwgJ38ROvOBq9+unwKr8C3i+CzOh1MSPSBhzWW1RbkTnmcjV7mGneOw4izc143zkTd1I94rAUkocKwoihEEiEo+ZplY/y5+ax7Gz0XfjGv5xugUPqVZzxo1Qiof7xeLpabFYFEURhlJpQSrWtcvVXbnTT44Tn/cJ50KADUdqCARVhUWQUMIlASRNg7Rt02WmSHnDfCPLnbIajgO31dRlgpK3aZRugtTzAAyIdIR4XzwvXVrzla6Z+ilhckyqjplcIWMU4zJ2kiQpVAAMagIKtpboeV7eZs0K+iaF5jW5MCYFx4JCEeHG12FCFqaySI/HhICvGkLFNMtwqU2DBkGbgKfeNEbnQwqqCEDYuly2y2wApoOCXyyQrnlt0NjSBG87ntgVQqx8pnmQorCkl8PmAEDwvAFINDQyr/UUNQ6ud580B/QYV3BEpWnTXCutmhRRcZykfY0JFMxxXknvWFAhCfOncvsZcEYWQ8Vl6tlILtOjlxBwiHHupRI8nbUv8QS9Axm7rcaB29JajOb82LYZ3SjT1guSwBrcK4ik0ZonCAZq01fcnZbVGHCIseBRBNXaUA8qBsGQMl9IwU6FKOAk1IJzXxh3DsPGgHc3rlA8Qv0L5RFRWxU9AlIKgrcUmzhOgmPeGcZrnyl3Ng78pfwzN5uJy9EDDBGXj0rnUBExJv2gIJka5mBrg3I2cKL/CbB8UPt44huD1uwLnR9TKlwPRNLPK17ilw1vvi2Px1xzdEmfUVTGgX/bmUUco+ZJEBotc++YLhuLC15eXorUo1NHLwMP6zQarwVeDsrdrzuBBoygvApahJKZl4UB6jpZ5V+OR5kjrzP0Rd/HsiBqfxx4Vz4YBG/T4bvUQH24iHO+31D1BymlzDGVMv/WaFWz2vdtA/4EWP5V7h30SkF5SF+NNij8OP4eGt1JL6CU/qZ1N7RXPyIeDNejUb7T+4NDSCv0NvlOqnKOth0EqJIWDZL1AtWEXasM8rC6qartBaAUGwIeLPT7937pIF/yDt3MVrFuTg7GZaShr7l7M9YctihSwUOkP7M/zvr7jOoaLAEIdIsyxtj0+jv2ahe5N1Y+AG/RCddYL7HI0brW6wDRMlwktt1S9eXZt662wP7VqGFwnJ8i45z6wq27RlhpdiP1WG1o0RQNcma1XOa9LD1PapynNUwog7ziJK67/frBZGrWRockAquKUvjAlX4MpeS4u6NewHl/HQfhSURHfpx+AFYVLfAbrHGHha6NXuCDQ/1G0eQWhvQ6SCjPDg6icc9T0Xk70nRPFtjokL7roMd2RF7wM8JCn/P2iMv0UtrYBWVtVVwgls4A7EL7TofOICo8O1ggcebntXIGvKUFILRAazCZoxtCcYtohimnc+igX+wRQhh8W44AaQrBrU/dfrCH9wYPr6qHiMNJwzi0Ck7HgbwhoLG32FhYg3s19QBszl3IP9HwK1KRk8MdGxnScmFJ8KNjAzQQ+WJwIE7vu3fdwXk3GXbxoJ0IrY5O71HnZDERh48EDPW4hjQpRXCX/e19JwY3USaetaFFE7+KDbkY96ENs97bu58UHGcFrmucM+l70qvNG8rCNx32LXBOeWNvQwTiA91BxbI5pd1hIQ5nQJSAOxtf6KflDebc/T7cc8o3W7g0yOiz0lVnVRxCe7Sv6pPJgYqv66SUj/KRS9k00nYT6g7Ue3BGyIZOW8Hy8mGdfwP8WqL2lC6CQWixw6R0MjAZ5PV6gNFCoNPclp9UigaPVnUMlLghC/GcmJB19PaYZUXw+Cizb54dJTw8/NAaUFXleC3rzHb7lniPnYJVCcajptOBfZOFarAQLPvhxFsp2wxHgNXX6WytlDcIFPwRrLQsOhkEWq3wiFFofKTXdviO7N71mvdB2c7WuvG8DLKkW2FS8aPLAgstMvIHfgPjTo5v9Lx3Lnw7LBExwrLekgSF1PJHAFOLIOvClbJHAWZ1jLc0dLfZB3svPFZgau8ysghDuW6gx6rRj6RafwR+72WPeNEH/S48+EwHYrtUEl1UQlG8FqvhKFMZPQThen6Rd+FZj4h5H0OSPiPhOny0fxC6uATv9r29o4+3qiHR+Ce9+qPGfpL2GRDnFXWF22v2baii11awLCu+diNOOzb4w/S9ZjjH6KI7m74rutEtgmrYjruZEVLQXgGYwztw/bxVle+eeD7ZxDg5hpC6M9EwwNBIy9bz6mxn7NqtKqshPSJZLfEEQTjTDbjpx83EK7f7/o5UnHBuj/tXdji/kkNna3Yt7oodToucu9H6KtxVe7CVRV6Hu3ZTlxLuKtzV287jUf2P72P/BlsQ1pgWs74FAAAAAElFTkSuQmCC" width="30" height="30" alt="" /></span>`;
  }

  async function loadWcs2027() {
    try {
      const response = await fetch(WCS_2027_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`WCS 2027 HTTP ${response.status}`);
      const data = await response.json();
      if (data?.players && typeof data.players === 'object') wcs2027 = data;
    } catch (error) {
      console.warn('WCS 2027 資格名單讀取失敗', error);
    }
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
    if (!skipWcs && wcs2027Info(id)) parts.push(wcs2027BadgeHtml(id));
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
      wcs2027Info(id)?.place || '',
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
      <span class="player-badge-legend-line">WCS Logo＝2026 世界賽選手　WCS 2027＝2027 世界賽邀請資格　<span class="player-attention-star is-active" aria-hidden="true">★</span>＝注意名單</span>
      <span class="player-badge-legend-line"><b>¹</b>＝冠軍　<b>²</b>＝亞軍；超級球自該次冠／亞軍日起保留60天，高級球／紀念球看本賽季</span>
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
    const invite = wcs2027Info(id);
    const inviteHtml = invite ? `<div class="player-wcs-2027-detail"><strong>🏆 WCS 2027 邀請資格</strong><span>${esc(invite.event)} · ${esc(invite.place)}</span><span>PTCG ID：${esc(id)}　｜　取得邀請資格，不代表已確認參賽</span></div>` : '';
    const modalHtml = `<div class="player-badge-row">${infoHtml}</div>${inviteHtml}${auth ? `<button class="player-attention-modal-control${attentionSet.has(id) ? ' is-active' : ''}" type="button" data-player-attention-toggle="${esc(id)}">${attentionSet.has(id) ? '★ 已加入注意名單' : '☆ 加入注意名單'}</button>` : ''}`;
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
    // 不必等其他外部資料載入完成，即先顯示已確認的 2027 資格。
    scheduleDecorate();
    await Promise.all([loadPublicBadges(), loadWcsIcon(), loadWcs2027()]);
    startAuthRetry();
    scheduleDecorate();
  }

  window.PTCGPlayerBadges = {
    get data() { return badgeData; },
    get ready() { return publicReady; },
    html: badgesHtml,
    wcs2027: wcs2027Info,
    legendHtml,
    isAttention: playerId => attentionSet.has(normalizeId(playerId)),
    refreshAttention: refreshAttentionMarks,
    toggleAttention,
    refresh: scheduleDecorate
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
