const GROUP_LABELS = { Master: '大師組', Senior: '少年組', Junior: '孩童組' };

let rankingData = { updated_at: null, groups: { Master: [], Senior: [], Junior: [] } };
let activeGroup = 'Junior';
let searchKeyword = '';

const container = document.getElementById('rankingContainer');
const searchInput = document.getElementById('rankingSearch');
const statusText = document.getElementById('dataStatus');
const updatedAt = document.getElementById('updatedAt');
const statusDot = document.querySelector('.status-dot');

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(iso) {
  if (!iso) return '尚未有排名更新紀錄';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `資料更新：${new Intl.DateTimeFormat('zh-TW', {
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

function renderRanking() {
  const allRows = rankingData.groups[activeGroup] || [];
  const rows = filteredRows();

  if (!allRows.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>${GROUP_LABELS[activeGroup]}目前尚無排名資料</strong>
        <span>新賽季空榜屬正常狀況；官方有資料後會由自動更新程式寫入。</span>
      </div>`;
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

  const body = rows.map(row => {
    const playerUrl = row.player_url || (row.player_id
      ? `https://asia.pokemon-card.com/tw/users/${encodeURIComponent(row.player_id)}/`
      : '');
    const player = playerUrl
      ? `<a class="player-link" href="${esc(playerUrl)}" target="_blank" rel="noopener">${esc(row.name || row.player_id || '—')}</a>`
      : esc(row.name || '—');

    return `
      <tr>
        <td><span class="rank-badge">${esc(row.rank ?? '—')}</span></td>
        <td>${player}${row.player_id ? `<div class="hint">${esc(row.player_id)}</div>` : ''}</td>
        <td>${esc(row.region || '—')}</td>
        <td>${esc(row.points ?? '—')} pt</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="ranking-table">
        <thead><tr><th>排名</th><th>玩家</th><th>地區</th><th>得分</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

async function loadRanking() {
  try {
    const response = await fetch(`data/ranking.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    rankingData = {
      ...raw,
      groups: normalizeGroups(raw)
    };
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

document.getElementById('playerLookupForm').addEventListener('submit', event => {
  event.preventDefault();
  const raw = document.getElementById('playerIdInput').value.trim();
  if (!raw) return;
  const id = raw.replace(/\s+/g, '');
  const url = `https://asia.pokemon-card.com/tw/users/${encodeURIComponent(id)}/`;
  window.open(url, '_blank', 'noopener');
});

loadRanking();
