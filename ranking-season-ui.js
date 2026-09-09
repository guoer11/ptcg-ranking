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

function worldCutLineRow(row) {
  const rank = Number(row?.rank);
  const slots = Number(WORLD_SLOTS[activeGroup]);
  if (rank !== slots) return '';
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

  const body = rows.map(row => `
    <tr class="${worldQualificationClass(row)}">
      <td><span class="rank-badge">${esc(row.rank ?? '—')}</span></td>
      <td>${playerNameHtml(row)}</td>
      <td>${esc(row.points ?? '—')} pt</td>
      <td>${esc(GROUP_LABELS[activeGroup])}</td>
      <td>${esc(row.region || '—')}</td>
      <td class="detail-col">${detailButton(row.player_id)}</td>
    </tr>
    ${worldCutLineRow(row)}`).join('');

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

  const chronological = snapshots.map(snapshot => ({
    updated_at: snapshot.updated_at,
    player: findPlayerInSnapshot(snapshot, playerId)
  }));

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
