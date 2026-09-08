const GROUP_LABELS = { Master: '大師組', Senior: '少年組', Junior: '孩童組' };
const DEMO_PLAYER_ID = 'tw64474352';

let rankingData = { updated_at: null, groups: { Master: [], Senior: [], Junior: [] } };
let activeGroup = 'Junior';
let searchKeyword = '';

const container = document.getElementById('rankingContainer');
const searchInput = document.getElementById('rankingSearch');
const statusText = document.getElementById('dataStatus');
const updatedAt = document.getElementById('updatedAt');
const statusDot = document.querySelector('.status-dot');
const modal = document.getElementById('playerModal');
const modalTitle = document.getElementById('playerModalTitle');
const modalUpdated = document.getElementById('playerModalUpdated');
const modalBody = document.getElementById('playerModalBody');

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(iso, prefix = '資料更新：') {
  if (!iso) return '尚未有排名更新紀錄';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${prefix}${new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d)}`;
}

function normalizeGroups(data) {
  if (data?.groups) return data.groups;
  return {
    Master: data?.Master || [],
    Senior: data?.Senior || [],
    Junior: data?.Junior || []
  };
}

function updateSummary() {
  const groups = rankingData.groups;
  document.getElementById('countMaster').textContent = groups.Master?.length || 0;
  document.getElementById('countSenior').textContent = groups.Senior?.length || 0;
  document.getElementById('countJunior').textContent = groups.Junior?.length || 0;
}

function filteredRows() {
  const rows = rankingData.groups[activeGroup] || [];
  if (!searchKeyword) return rows;
  const key = searchKeyword.toLowerCase();
  return rows.filter(row => [row.name, row.player_id, row.region, row.points, row.rank]
    .some(v => String(v ?? '').toLowerCase().includes(key)));
}

function detailButton(playerId, label = '查看玩家詳細資料') {
  if (!playerId) {
    return '<button class="detail-btn" type="button" disabled title="目前沒有 PTCG ID">⌕</button>';
  }
  return `<button class="detail-btn" type="button" data-player-id="${esc(playerId)}" title="${esc(label)}" aria-label="${esc(label)}">⌕</button>`;
}

function demoRow() {
  return `
    <div class="demo-box">
      <div class="demo-label">v0.2 介面預覽</div>
      <p>目前官方新賽季排行榜仍是空榜，所以先用 Yule 示範未來排行榜的放大鏡操作。</p>
      <div class="demo-ranking-row">
        <span class="rank-badge">17</span>
        <div class="demo-player"><strong>Yule</strong><small>tw64474352</small></div>
        <strong class="demo-points">195 pt</strong>
        <span>孩童組</span>
        <span>高雄市</span>
        ${detailButton(DEMO_PLAYER_ID, '預覽 Yule 玩家詳細資料')}
      </div>
    </div>`;
}

function renderRanking() {
  const allRows = rankingData.groups[activeGroup] || [];
  const rows = filteredRows();

  if (!allRows.length) {
    container.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>${GROUP_LABELS[activeGroup]}目前尚無排名資料</strong>
        <span>新賽季空榜屬正常狀況；官方有資料後會由自動更新程式寫入。</span>
      </div>
      ${activeGroup === 'Junior' ? demoRow() : ''}`;
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
    <tr>
      <td><span class="rank-badge">${esc(row.rank ?? '—')}</span></td>
      <td>
        <strong>${esc(row.name || row.player_id || '—')}</strong>
        ${row.player_id ? `<div class="hint row-id">${esc(row.player_id)}</div>` : ''}
      </td>
      <td>${esc(row.points ?? '—')} pt</td>
      <td>${esc(GROUP_LABELS[activeGroup])}</td>
      <td>${esc(row.region || '—')}</td>
      <td class="detail-col">${detailButton(row.player_id)}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="ranking-table">
        <thead><tr><th>排名</th><th>玩家</th><th>得分</th><th>組別</th><th>地區</th><th aria-label="詳細資料"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  bindDetailButtons();
}

async function loadRanking() {
  try {
    const response = await fetch(`data/ranking.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    rankingData = { ...raw, groups: normalizeGroups(raw) };
    statusText.textContent = '資料讀取正常';
    updatedAt.textContent = formatTime(raw.updated_at);
    statusDot.classList.add('ok');
    updateSummary();
    renderRanking();
  } catch (error) {
    console.error(error);
    statusText.textContent = '資料讀取失敗';
    updatedAt.textContent = '請檢查 data/ranking.json';
    statusDot.classList.add('error');
    container.innerHTML = '<div class="empty-state"><strong>無法載入排名資料</strong><span>請稍後重新整理。</span></div>';
  }
}

function bindDetailButtons() {
  document.querySelectorAll('[data-player-id]').forEach(button => {
    button.addEventListener('click', () => openPlayerModal(button.dataset.playerId));
  });
}

function openModalShell() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePlayerModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function playerOfficialUrl(id) {
  return `https://asia.pokemon-card.com/tw/users/${encodeURIComponent(id)}/`;
}

function top8Html(top8) {
  const points = Array.isArray(top8?.points) ? top8.points : [];
  if (!points.length) {
    return '<div class="top8-empty">尚無可計算的積分賽事。</div>';
  }
  const formula = points.map(v => Number(v) || 0).join('+');
  const total = top8?.total ?? points.reduce((sum, v) => sum + (Number(v) || 0), 0);
  return `
    <section class="top8-card">
      <div class="top8-head"><strong>⚡ 前 8 場高積分賽事</strong><span>TOP 8</span></div>
      <div class="top8-formula"><span>${points.length} 場合計</span> ${esc(formula)} = <strong>${esc(total)}分</strong></div>
    </section>`;
}

function eventsHtml(data) {
  const events = Array.isArray(data.events) ? data.events : [];
  if (!events.length) {
    return '<div class="empty-state"><strong>目前沒有賽事紀錄</strong><span>等公開資料抓取完成後會顯示在這裡。</span></div>';
  }
  const rows = events.map(event => `
    <tr>
      <td>${esc(event.name || '—')}</td>
      <td>${esc(event.date || '—')}</td>
      <td>${esc(event.location || '—')}</td>
      <td class="event-points">${esc(event.points ?? '—')}</td>
    </tr>`).join('');
  return `
    <div class="event-table-scroll">
      <table class="event-table">
        <thead><tr><th>賽事</th><th>日期</th><th>地點</th><th>積分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPlayerDetail(data) {
  modalTitle.textContent = data.name || data.player_id || '玩家詳細資料';
  modalUpdated.textContent = data.updated_at ? formatTime(data.updated_at, '最後更新：') : '最後更新：—';

  const note = data.events_note
    ? `<div class="demo-note">${esc(data.events_note)}</div>`
    : '';
  const demoBadge = data.demo ? '<span class="demo-badge">示範資料</span>' : '';
  const totalEvents = Number.isFinite(Number(data.total_events)) ? Number(data.total_events) : (data.events?.length || 0);

  modalBody.innerHTML = `
    ${demoBadge}
    <section class="player-stat-grid">
      <article><strong>${esc(data.official_points ?? '—')}pt</strong><span>本季積分</span></article>
      <article><strong class="player-id-value">${esc(data.player_id || '—')}</strong><span>PTCG ID</span></article>
      <article><strong>${esc(data.group_label || GROUP_LABELS[data.group] || '—')}</strong><span>組別</span></article>
      <article><strong>${esc(data.region || '—')}</strong><span>地區</span></article>
    </section>

    ${top8Html(data.top8)}

    <section class="events-section">
      <div class="events-title-row">
        <h3>▣ 所有賽事紀錄 <span>(${esc(totalEvents)} 場賽事)</span></h3>
        <a class="official-link" href="${esc(playerOfficialUrl(data.player_id))}" target="_blank" rel="noopener">官方玩家頁 ↗</a>
      </div>
      ${note}
      ${eventsHtml(data)}
    </section>`;
}

async function openPlayerModal(playerId) {
  if (!playerId) return;
  openModalShell();
  modalTitle.textContent = '玩家詳細資料';
  modalUpdated.textContent = '資料載入中…';
  modalBody.innerHTML = '<div class="modal-loading">資料載入中…</div>';

  try {
    const response = await fetch(`data/players/${encodeURIComponent(playerId)}.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderPlayerDetail(data);
  } catch (error) {
    console.warn('本站尚無玩家詳細資料：', playerId, error);
    modalTitle.textContent = playerId;
    modalUpdated.textContent = '本站尚未建立此玩家詳細資料';
    modalBody.innerHTML = `
      <div class="detail-unavailable">
        <strong>這位玩家目前只有排行榜資料</strong>
        <p>等玩家公開賽事抓取功能完成後，這裡會顯示 Top 8 與所有賽事紀錄。</p>
        <a class="primary-btn link-btn" href="${esc(playerOfficialUrl(playerId))}" target="_blank" rel="noopener">先開啟官方玩家頁</a>
      </div>`;
  }
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    activeGroup = button.dataset.group;
    renderRanking();
  });
});

searchInput.addEventListener('input', event => {
  searchKeyword = event.target.value.trim();
  renderRanking();
});

document.getElementById('playerLookupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const raw = document.getElementById('playerIdInput').value.trim();
  if (!raw) return;
  const id = raw.replace(/\s+/g, '');
  await openPlayerModal(id);
});

document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closePlayerModal));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal.classList.contains('open')) closePlayerModal();
});

loadRanking();
