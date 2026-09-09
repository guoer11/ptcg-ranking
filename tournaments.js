const TOURNAMENT_LEAGUE_LABELS = {
  Great: '超級球',
  Ultra: '高級球',
  Premier: '紀念球',
  Master: '大師球'
};

const TOURNAMENT_GROUP_LABELS = {
  Junior: '孩童組',
  Senior: '少年組',
  Master: '大師組',
  Open: '全年齡組'
};

let tournamentData = { season: '2026-27', updated_at: null, events: [] };
let tournamentLeague = 'all';
let tournamentKeyword = '';
let tournamentStatus = 'all';
let tournamentSeason = '2026-27';
let tournamentRegion = 'all';

const tournamentList = document.getElementById('tournamentList');
const tournamentSearch = document.getElementById('tournamentSearch');
const tournamentStatusFilter = document.getElementById('tournamentStatusFilter');
const tournamentSeasonFilter = document.getElementById('tournamentSeasonFilter');
const tournamentRegionFilter = document.getElementById('tournamentRegionFilter');
const tournamentModal = document.getElementById('tournamentModal');
const tournamentModalTitle = document.getElementById('tournamentModalTitle');
const tournamentModalSubtitle = document.getElementById('tournamentModalSubtitle');
const tournamentModalBody = document.getElementById('tournamentModalBody');

function tournamentEsc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tournamentFormatUpdate(iso) {
  if (!iso) return '更新時間：尚未有更新紀錄';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `更新時間：${iso}`;
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `更新時間：${parts.year}/${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

function todayTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function eventStatus(event) {
  if (Array.isArray(event.results) && event.results.length) return 'results';
  const date = String(event.date || '').slice(0, 10);
  if (date && date < todayTaipei()) return 'waiting';
  return 'upcoming';
}

function eventStatusLabel(status) {
  if (status === 'results') return '已有官方成績';
  if (status === 'waiting') return '等待官方成績';
  return '未舉行';
}

function eventGroupLabel(group) {
  return TOURNAMENT_GROUP_LABELS[group] || group || '全年齡組';
}

function eventVenueLabel(event) {
  const venue = String(event?.venue || '').trim();
  const address = String(event?.address || '').trim();
  if (event?.league === 'Ultra') {
    return address || venue;
  }
  return venue;
}

function splitUltraAddress(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)(\s*[（(][^()（）]+[）)])\s*$/);
  if (!match || !match[1].trim()) return { main: text, note: '' };
  return {
    main: match[1].trim(),
    note: match[2].trim()
  };
}

function eventHasResults(event) {
  return Array.isArray(event?.results) && event.results.length > 0;
}

function formatEventDate(dateValue, timeValue = '') {
  const raw = String(dateValue || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { main: raw || '日期未定', sub: timeValue || '' };
  return {
    main: `${Number(match[2])}/${Number(match[3])}`,
    sub: `${match[1]}${timeValue ? ` · ${timeValue}` : ''}`
  };
}

function eventSearchTerms(event) {
  const terms = [
    event.title,
    event.venue,
    eventVenueLabel(event),
    event.region,
    event.address,
    event.group,
    event.event_id,
    event.season,
    TOURNAMENT_LEAGUE_LABELS[event.league],
    eventGroupLabel(event.group)
  ];

  const match = String(event.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, monthRaw, dayRaw] = match;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    terms.push(
      `${month}/${day}`,
      `${month}-${day}`,
      `${month}月${day}日`,
      `${year}/${month}/${day}`,
      `${year}-${month}-${day}`
    );
  }

  return terms.map(value => String(value || '').toLowerCase());
}

function filteredTournaments() {
  const key = tournamentKeyword.toLowerCase();
  return (tournamentData.events || [])
    .filter(event => tournamentLeague === 'all' || event.league === tournamentLeague)
    .filter(event => tournamentStatus === 'all' || eventStatus(event) === tournamentStatus)
    .filter(event => tournamentSeason === 'all' || String(event.season || tournamentData.season || '') === tournamentSeason)
    .filter(event => tournamentRegion === 'all' || event.region === tournamentRegion)
    .filter(event => !key || eventSearchTerms(event).some(value => value.includes(key)))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant'));
}

function updateTournamentSummary() {
  const events = tournamentData.events || [];
  const today = todayTaipei();
  const upcoming = events.filter(event => String(event.date || '') >= today).length;
  const resultEvents = events.filter(event => Array.isArray(event.results) && event.results.length).length;
  const resultRows = events.reduce((sum, event) => sum + (Array.isArray(event.results) ? event.results.length : 0), 0);
  document.getElementById('tournamentTotalCount').textContent = events.length;
  document.getElementById('tournamentUpcomingCount').textContent = upcoming;
  document.getElementById('tournamentResultCount').textContent = resultEvents;
  document.getElementById('tournamentPlayerResultCount').textContent = resultRows;
}

function setupTournamentFilters() {
  const events = tournamentData.events || [];
  const seasons = [...new Set(events.map(event => event.season || tournamentData.season).filter(Boolean))].sort().reverse();
  if (!seasons.length && tournamentData.season) seasons.push(tournamentData.season);
  tournamentSeasonFilter.innerHTML = seasons.map(season => `<option value="${tournamentEsc(season)}">${tournamentEsc(season)} 賽季</option>`).join('');
  tournamentSeason = seasons.includes(tournamentData.season) ? tournamentData.season : (seasons[0] || 'all');
  tournamentSeasonFilter.value = tournamentSeason;

  const regions = [...new Set(events.map(event => event.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  tournamentRegionFilter.innerHTML = '<option value="all">⌖ 全國</option>' + regions.map(region => `<option value="${tournamentEsc(region)}">⌖ ${tournamentEsc(region)}</option>`).join('');
  tournamentRegionFilter.value = 'all';
}

function renderTournamentList() {
  const events = filteredTournaments();
  if (!events.length) {
    tournamentList.innerHTML = '<div class="empty-state tournament-grid-empty"><strong>目前沒有符合條件的賽事</strong><span>可調整賽季、地區、賽事類型或搜尋條件。</span></div>';
    return;
  }

  tournamentList.innerHTML = events.map(event => {
    const date = formatEventDate(event.date, event.time || '');
    const status = eventStatus(event);
    const venue = eventVenueLabel(event);
    const venueParts = event.league === 'Ultra' ? splitUltraAddress(venue) : { main: venue, note: '' };
    const hasResults = eventHasResults(event);
    return `
      <article class="tournament-card">
        <div class="tournament-card-top">
          <div class="tournament-card-badges">
            <span class="league-badge ${tournamentEsc(event.league || '')}">${tournamentEsc(TOURNAMENT_LEAGUE_LABELS[event.league] || event.league || '聯盟賽')}</span>
            ${event.region ? `<span class="location-badge">⌖ ${tournamentEsc(event.region)}</span>` : ''}
          </div>
          ${hasResults
            ? `<button class="result-badge results results-button" type="button" data-event-id="${tournamentEsc(event.event_id)}" aria-label="查看${tournamentEsc(event.title || '賽事')}成績">查看成績</button>`
            : `<span class="result-badge ${status}">${eventStatusLabel(status)}</span>`}
        </div>

        <div class="tournament-date">
          <strong>${tournamentEsc(date.main)}</strong>
          <span>${tournamentEsc(date.sub)}</span>
        </div>

        <h3>${tournamentEsc(event.title || `官方活動 ${event.event_id || ''}`)}</h3>

        <div class="tournament-card-info">
          ${venueParts.main ? `<span title="${tournamentEsc(venue)}">⌂ ${tournamentEsc(venueParts.main)}</span>` : ''}
          ${venueParts.note ? `<span class="tournament-address-note" title="${tournamentEsc(venue)}">${tournamentEsc(venueParts.note)}</span>` : ''}
          ${event.capacity ? `<span>♟ ${tournamentEsc(event.capacity)} 人</span>` : ''}
          ${event.group && event.group !== 'Open' ? `<span>${tournamentEsc(eventGroupLabel(event.group))}</span>` : ''}
        </div>
      </article>`;
  }).join('');

  tournamentList.querySelectorAll('[data-event-id]').forEach(button => {
    button.addEventListener('click', () => openTournamentModal(button.dataset.eventId));
  });
}

function renderTournamentResults(event) {
  const results = Array.isArray(event.results) ? event.results : [];
  if (!results.length) {
    return '<div class="empty-state compact-empty"><strong>等待官方成績</strong><span>官方公布活動結果後，自動更新排程會嘗試收錄成績。</span></div>';
  }
  const rows = results.map(row => `
    <tr>
      <td>${tournamentEsc(row.rank ?? '—')}</td>
      <td>${tournamentEsc(row.name || '—')}</td>
      <td>${tournamentEsc(row.player_id || '—')}</td>
      <td>${tournamentEsc(row.region || '—')}</td>
      <td><strong>${tournamentEsc(row.points ?? '—')} pt</strong></td>
    </tr>`).join('');
  return `
    <div class="tournament-result-table-wrap">
      <table class="tournament-result-table">
        <thead><tr><th>排名</th><th>玩家</th><th>PTCG ID</th><th>地區</th><th>獲得積分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openTournamentModal(eventId) {
  const event = (tournamentData.events || []).find(item => String(item.event_id) === String(eventId));
  if (!event) return;
  const venue = eventVenueLabel(event);
  const venueParts = event.league === 'Ultra' ? splitUltraAddress(venue) : { main: venue, note: '' };
  const detailAddress = String(event.address || '').trim();
  const showAddress = detailAddress && detailAddress !== venue;

  tournamentModal.classList.add('open');
  tournamentModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  tournamentModalTitle.textContent = `${event.title || '賽事詳情'} · 官方成績`;
  const subtitle = [
    TOURNAMENT_LEAGUE_LABELS[event.league] || '',
    event.group && event.group !== 'Open' ? eventGroupLabel(event.group) : '',
    event.region || ''
  ].filter(Boolean).join(' · ');
  tournamentModalSubtitle.textContent = subtitle || '賽事資訊';
  tournamentModalBody.innerHTML = `
    <section class="tournament-detail-grid">
      <article><strong>${tournamentEsc(event.date || '—')}</strong><span>比賽日期</span></article>
      <article><strong>${tournamentEsc(event.time || '—')}</strong><span>比賽時間</span></article>
      <article><strong>${tournamentEsc(venueParts.main || '—')}${venueParts.note ? `<br><small>${tournamentEsc(venueParts.note)}</small>` : ''}</strong><span>會場 / 地址</span></article>
      <article><strong>${tournamentEsc(event.capacity || '—')}</strong><span>人數上限</span></article>
    </section>
    ${showAddress ? `<p class="hint">${tournamentEsc(detailAddress)}</p>` : ''}
    <h3>官方活動結果</h3>
    ${renderTournamentResults(event)}
    ${event.url ? `<a class="primary-btn tournament-result-link" href="${tournamentEsc(event.url)}" target="_blank" rel="noopener">開啟官方活動頁 ↗</a>` : ''}`;
}

function closeTournamentModal() {
  tournamentModal.classList.remove('open');
  tournamentModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function loadTournamentData() {
  const statusText = document.getElementById('tournamentDataStatus');
  const updatedText = document.getElementById('tournamentUpdatedAt');
  const dot = document.getElementById('tournamentStatusDot');
  try {
    const response = await fetch(`data/tournaments.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    tournamentData = await response.json();
    statusText.textContent = '賽事資料讀取正常';
    updatedText.textContent = tournamentFormatUpdate(tournamentData.updated_at);
    dot.classList.add('ok');
    dot.classList.remove('error');
    setupTournamentFilters();
    updateTournamentSummary();
    renderTournamentList();
  } catch (error) {
    console.error(error);
    statusText.textContent = '賽事資料讀取失敗';
    updatedText.textContent = '請稍後重新整理';
    dot.classList.add('error');
    dot.classList.remove('ok');
    tournamentList.innerHTML = '<div class="empty-state"><strong>無法載入賽事資料</strong><span>請稍後重新整理。</span></div>';
  }
}

document.querySelectorAll('.league-tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.league-tab').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    tournamentLeague = button.dataset.league;
    renderTournamentList();
  });
});

tournamentSearch.addEventListener('input', event => {
  tournamentKeyword = event.target.value.trim();
  renderTournamentList();
});

tournamentStatusFilter.addEventListener('change', event => {
  tournamentStatus = event.target.value;
  renderTournamentList();
});

tournamentSeasonFilter.addEventListener('change', event => {
  tournamentSeason = event.target.value;
  renderTournamentList();
});

tournamentRegionFilter.addEventListener('change', event => {
  tournamentRegion = event.target.value;
  renderTournamentList();
});

document.querySelectorAll('[data-close-tournament-modal]').forEach(item => item.addEventListener('click', closeTournamentModal));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && tournamentModal.classList.contains('open')) closeTournamentModal();
});

loadTournamentData();
