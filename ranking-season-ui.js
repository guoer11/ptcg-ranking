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
    <img src="assets/q-icons/wcs2026icon.webp?v=2026" alt="" aria-hidden="true" />
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
