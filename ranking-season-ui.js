// v0.4: world-slot line, recent ranking trend, and season archive support.

const RANKING_SEASON_CONFIG = {
  season: '2026-27',
  seasonStart: '2026-09-01',
  trackingEnd: '2027-07-31',
  worldsStart: '2027-08-13',
  worldsEnd: '2027-08-15',
  worldsSource: 'https://worlds.pokemon.com/en-us/',
  worldSlots: { Master: 32, Senior: 16, Junior: 16 },
  historyLimit: 3
};

let rankingHistoryData = { season: RANKING_SEASON_CONFIG.season, max_snapshots: 3, snapshots: [] };

Object.assign(WORLD_SLOTS, RANKING_SEASON_CONFIG.worldSlots);

function seasonWorldSlotsLabel() {
  const label = document.getElementById('summaryWorldSlotsLabel');
  if (label) label.textContent = '世界賽名額（暫依上季）';
}

const baseUpdateSummaryV04 = updateSummary;
updateSummary = function updateSummaryV04() {
  baseUpdateSummaryV04();
  const worldSlots = WORLD_SLOTS[activeGroup];
  const target = document.getElementById('summaryWorldSlots');
  if (target) target.textContent = `${worldSlots} 名`;
  seasonWorldSlotsLabel();
};

function worldQualificationClass(row) {
  const rank = Number(row?.rank);
  const slots = Number(WORLD_SLOTS[activeGroup]);
  if (!Number.isFinite(rank) || !Number.isFinite(slots) || rank > slots) return '';
  return rank === slots ? 'world-qualified-row world-cutoff-rank' : 'world-qualified-row';
}

function worldCutLineRow(row, nextRow) {
  const rank = Number(row?.rank);
  const nextRank = Number(nextRow?.rank);
  const slots = Number(WORLD_SLOTS[activeGroup]);

  if (!Number.isFinite(rank) || !Number.isFinite(slots) || rank > slots) return '';

  // 名額線應該畫在「最後一位仍落在暫定名額內的玩家」之後。
  // 這樣就算名次因同分跳號（例如 29 名後直接到 41 名），
  // 或同一名次有多人並列，也只會顯示一條名額線。
  if (Number.isFinite(nextRank) && nextRank <= slots) return '';

  return `
    <tr class="world-cut-line" aria-label="暫定世界賽名額線">
      <td colspan="6"><span>暫定世界賽名額線｜前 ${slots} 名</span></td>
    </tr>`;
}

renderRanking = function renderRankingV04() {
  const allRows = rankingData.groups[activeGroup] || [];
  const rows = filteredRows();

  if (!allRows.length) {
    container.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>${GROUP_LABELS[activeGroup]}目前尚無排名資料</strong>
        <span>新賽季空榜屬正常狀況；官方有資料後會由自動更新程式寫入。</span>
      </div>
      ${activeGroup === 'Junior' ? demoTable() : ''}`;
    bindDetailButtons();
    return;
  }

  if (!rows.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>找不到符合條件的玩家</strong>
        <span>請換個名稱、PTCG ID 或地區再試一次。</span>
      </div>`;
    return;
  }

  const body = rows.map((row, index) => `
    <tr class="${worldQualificationClass(row)}">
      <td><span class="rank-badge">${esc(row.rank ?? '—')}</span></td>
      <td>${playerNameHtml(row)}</td>
      <td>${esc(row.points ?? '—')} pt</td>
      <td>${esc(GROUP_LABELS[activeGroup])}</td>
      <td>${esc(row.region || '—')}</td>
      <td class="detail-col">${detailButton(row.player_id)}</td>
    </tr>
    ${worldCutLineRow(row, rows[index + 1])}`).join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="ranking-table">
        <thead><tr><th>排名</th><th>玩家</th><th>得分</th><th>組別</th><th>地區</th><th aria-label="詳細資料"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  bindDetailButtons();
};

function findPlayerInSnapshot(snapshot, playerId) {
  const id = String(playerId || '').toLowerCase();
  if (!id) return null;
  for (const [group, rows] of Object.entries(snapshot?.groups || {})) {
    const row = (rows || []).find(item => String(item?.player_id || '').toLowerCase() === id);
    if (row) return { ...row, group };
  }
  return null;
}

function effectiveHistorySnapshots() {
  const snapshots = Array.isArray(rankingHistoryData?.snapshots)
    ? [...rankingHistoryData.snapshots]
    : [];

  if (rankingData?.updated_at && Object.values(rankingData.groups || {}).some(rows => rows?.length)) {
    const exists = snapshots.some(item => item?.updated_at === rankingData.updated_at);
    if (!exists) snapshots.push({
      season: rankingData.season,
      updated_at: rankingData.updated_at,
      groups: rankingData.groups
    });
  }

  snapshots.sort((a, b) => String(a?.updated_at || '').localeCompare(String(b?.updated_at || '')));
  return snapshots.slice(-RANKING_SEASON_CONFIG.historyLimit);
}

function compactDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10).replaceAll('-', '/');
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}/${parts.month}/${parts.day}`;
}

function signedValue(value, suffix = '') {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}

function rankingChangeText(current, previous) {
  if (current && !previous) return { label: 'NEW', className: 'trend-new' };
  if (!current && previous) return { label: '離榜', className: 'trend-down' };
  if (!current || !previous) return { label: '—', className: '' };

  const currentRank = Number(current.rank);
  const previousRank = Number(previous.rank);
  const rankDelta = Number.isFinite(currentRank) && Number.isFinite(previousRank)
    ? previousRank - currentRank
    : 0;
  const pointDelta = Number(current.points) - Number(previous.points);

  const parts = [];
  let className = '';
  if (rankDelta > 0) {
    parts.push(`▲ ${rankDelta} 名`);
    className = 'trend-up';
  } else if (rankDelta < 0) {
    parts.push(`▼ ${Math.abs(rankDelta)} 名`);
    className = 'trend-down';
  } else {
    parts.push('排名不變');
  }

  if (Number.isFinite(pointDelta) && pointDelta !== 0) parts.push(`${signedValue(pointDelta, ' pt')}`);
  return { label: parts.join(' · '), className };
}

function rankingTrendHtml(playerId) {
  const snapshots = effectiveHistorySnapshots();
  if (!snapshots.length) {
    return `
      <section class="ranking-trend-card">
        <div class="ranking-trend-head">
          <h3>排名趨勢</h3><span>最近 3 次有效變動</span>
        </div>
        <div class="ranking-trend-empty">正式排名出現並累積變動後，這裡會顯示排名與積分變化。</div>
      </section>`;
  }

  const chronologicalRaw = snapshots.map(snapshot => ({
    updated_at: snapshot.updated_at,
    player: findPlayerInSnapshot(snapshot, playerId)
  }));

  // 排名歷史是全站快照；其他玩家的暱稱或資料變動也可能產生新快照。
  // 玩家趨勢只保留「這位玩家自己」的排名、積分、組別或上/離榜狀態變化。
  const chronological = chronologicalRaw.filter((entry, index) => {
    if (index === 0) return true;
    const previous = chronologicalRaw[index - 1];
    const currentPlayer = entry.player;
    const previousPlayer = previous.player;
    if (!currentPlayer && !previousPlayer) return false;
    if (!currentPlayer || !previousPlayer) return true;
    return String(currentPlayer.group || '') !== String(previousPlayer.group || '')
      || Number(currentPlayer.rank) !== Number(previousPlayer.rank)
      || Number(currentPlayer.points) !== Number(previousPlayer.points);
  });

  const meaningful = chronological.some(item => item.player);
  if (!meaningful) {
    return `
      <section class="ranking-trend-card">
        <div class="ranking-trend-head">
          <h3>排名趨勢</h3><span>最近 3 次有效變動</span>
        </div>
        <div class="ranking-trend-empty">最近 3 次排名快照中尚未找到這位玩家。</div>
      </section>`;
  }

  const rows = chronological.map((entry, index) => {
    const previous = index > 0 ? chronological[index - 1].player : null;
    const change = rankingChangeText(entry.player, previous);
    const rank = entry.player?.rank != null ? `第 ${entry.player.rank} 名` : '未上榜';
    const points = entry.player?.points != null ? `${entry.player.points} pt` : '—';
    const group = entry.player?.group ? GROUP_LABELS[entry.player.group] : '';
    return { ...entry, rank, points, group, change };
  }).reverse();

  const rowHtml = rows.map(entry => `
    <div class="ranking-trend-row">
      <div class="ranking-trend-date">${esc(compactDate(entry.updated_at))}</div>
      <div class="ranking-trend-rank"><strong>${esc(entry.rank)}</strong>${entry.group ? `<small>${esc(entry.group)}</small>` : ''}</div>
      <div class="ranking-trend-points">${esc(entry.points)}</div>
      <div class="ranking-trend-change ${esc(entry.change.className)}">${esc(entry.change.label)}</div>
    </div>`).join('');

  return `
    <section class="ranking-trend-card">
      <div class="ranking-trend-head">
        <h3>排名趨勢</h3><span>最近 ${rows.length} 次有效變動</span>
      </div>
      <div class="ranking-trend-list">${rowHtml}</div>
    </section>`;
}

function injectRankingTrend(playerId) {
  if (!modalBody || !playerId) return;
  modalBody.querySelector('.ranking-trend-card')?.remove();
  const html = rankingTrendHtml(playerId);
  const stats = modalBody.querySelector('.player-stat-grid');
  if (stats) {
    stats.insertAdjacentHTML('afterend', html);
    return;
  }
  const unavailable = modalBody.querySelector('.detail-unavailable');
  if (unavailable) unavailable.insertAdjacentHTML('beforebegin', html);
  else modalBody.insertAdjacentHTML('afterbegin', html);
}

const baseOpenPlayerModalV04 = openPlayerModal;
openPlayerModal = async function openPlayerModalV04(playerId) {
  await baseOpenPlayerModalV04(playerId);
  injectRankingTrend(playerId);
};

const baseOpenDemoPlayerModalV04 = openDemoPlayerModal;
openDemoPlayerModal = function openDemoPlayerModalV04(demoKey) {
  baseOpenDemoPlayerModalV04(demoKey);
  const row = DEMO_ROWS.find(item => item.demo_key === demoKey);
  if (row) injectRankingTrend(row.player_id);
};

async function loadRankingHistory() {
  try {
    const response = await fetch(`data/ranking_history.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data?.snapshots)) rankingHistoryData = data;
  } catch (error) {
    console.warn('排名歷史資料載入失敗', error);
  }
}

seasonWorldSlotsLabel();
updateSummary();
loadRankingHistory();


// v2.1.0: IvanPTCG 2025-26 history + WCS 2026 badges.
let priorSeasonHistoryData = { season: '2025-26', players: {} };
let priorSeasonHistoryPromise = null;

function priorSeasonFor(playerId) {
  if (!playerId) return null;
  return priorSeasonHistoryData?.players?.[String(playerId).trim().toLowerCase()] || null;
}

function worldsIconHtml(label = '2025-2026 世界賽選手') {
  return `<span class="wcs-player-icon" title="${esc(label)}" aria-label="${esc(label)}" role="img">
    <img src="data:image/webp;base64,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" alt="" aria-hidden="true" />
  </span>`;
}

playerNameHtml = function playerNameHtmlV210(row) {
  const identity = identityFor(row.player_id);
  const realName = identity?.real_name;
  const displayName = String(row.name || row.player_id || '—');
  const nameLength = Array.from(displayName).length;
  const sizeClass = nameLength >= 13 ? ' player-name-xlong' : (nameLength >= 8 ? ' player-name-long' : '');
  const history = priorSeasonFor(row.player_id);
  return `
    <div class="player-name-line">
      <strong class="player-name${sizeClass}">${esc(displayName)}</strong>
      ${history?.worlds_2026 ? worldsIconHtml() : ''}
    </div>
    ${realName ? `<div class="player-real-name">${esc(realName)}</div>` : ''}
    ${row.player_id ? `<div class="hint row-id">${esc(row.player_id)}</div>` : ''}`;
};

function priorSeasonDetailHtml(playerId) {
  const history = priorSeasonFor(playerId);
  if (!history) return '';
  const rank = Number(history.rank);
  const points = Number(history.points);
  const rankText = Number.isFinite(rank) && rank > 0 ? `第 ${rank} 名` : '—';
  const pointsText = Number.isFinite(points) ? `${points} pt` : '—';
  return `
    <section class="prior-season-card">
      <div class="prior-season-head">
        <div><span>2025-2026 賽季</span><strong>上季成績</strong></div>
        ${history.worlds_2026 ? `<div class="prior-worlds-label">${worldsIconHtml()}<span>2025-2026 世界賽選手</span></div>` : ''}
      </div>
      <div class="prior-season-grid">
        <article><strong>${esc(history.league || '—')}</strong><span>組別</span></article>
        <article><strong>${esc(rankText)}</strong><span>最終排名</span></article>
        <article><strong>${esc(pointsText)}</strong><span>積分</span></article>
      </div>
      <small class="prior-season-source">歷史資料來源：IvanPTCG 公開排名資料</small>
    </section>`;
}

function injectPriorSeasonDetail(playerId) {
  if (!modalBody || !playerId) return;
  modalBody.querySelector('.prior-season-card')?.remove();
  const html = priorSeasonDetailHtml(playerId);
  if (!html) return;
  const trend = modalBody.querySelector('.ranking-trend-card');
  if (trend) {
    trend.insertAdjacentHTML('afterend', html);
    return;
  }
  const stats = modalBody.querySelector('.player-stat-grid');
  if (stats) stats.insertAdjacentHTML('afterend', html);
  else modalBody.insertAdjacentHTML('afterbegin', html);
}

async function loadPriorSeasonHistory() {
  try {
    const response = await fetch(`data/season_2025_26.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return priorSeasonHistoryData;
    const data = await response.json();
    if (data?.players && typeof data.players === 'object') priorSeasonHistoryData = data;
  } catch (error) {
    console.warn('2025-26 歷史排名資料載入失敗', error);
  }
  return priorSeasonHistoryData;
}

function ensurePriorSeasonHistory() {
  if (!priorSeasonHistoryPromise) priorSeasonHistoryPromise = loadPriorSeasonHistory();
  return priorSeasonHistoryPromise;
}

const baseOpenPlayerModalV210 = openPlayerModal;
openPlayerModal = async function openPlayerModalV210(playerId) {
  await Promise.all([baseOpenPlayerModalV210(playerId), ensurePriorSeasonHistory()]);
  injectPriorSeasonDetail(playerId);
};

const baseOpenDemoPlayerModalV210 = openDemoPlayerModal;
openDemoPlayerModal = function openDemoPlayerModalV210(demoKey) {
  baseOpenDemoPlayerModalV210(demoKey);
  const row = DEMO_ROWS.find(item => item.demo_key === demoKey);
  if (row) ensurePriorSeasonHistory().then(() => injectPriorSeasonDetail(row.player_id));
};

ensurePriorSeasonHistory().then(() => {
  if (Object.values(rankingData?.groups || {}).some(rows => rows?.length)) renderRanking();
});
