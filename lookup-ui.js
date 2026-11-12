let lookupGroup = 'all';

const LOOKUP_GROUP_LABELS = {
  all: '全部',
  Junior: '孩童組',
  Senior: '少年組',
  Master: '大師組'
};

function normalizeLookupValue(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

function allLookupRankingRows() {
  const rows = [];
  for (const [group, groupRows] of Object.entries(rankingData?.groups || {})) {
    for (const row of groupRows || []) rows.push({ ...row, group });
  }
  for (const row of DEMO_ROWS || []) rows.push({ ...row, group: 'Junior', demo: true });
  return rows;
}

function lookupRankingInfo(playerId) {
  const id = normalizeLookupValue(playerId);
  return allLookupRankingRows().find(row => normalizeLookupValue(row.player_id) === id) || null;
}

function lookupOfficialRankingInfo(playerId) {
  const id = normalizeLookupValue(playerId);
  return allLookupRankingRows().find(row => !row.demo && normalizeLookupValue(row.player_id) === id) || null;
}

function lookupCandidateScore(candidate, key) {
  const values = [candidate.real_name, candidate.name, candidate.player_id]
    .map(normalizeLookupValue)
    .filter(Boolean);
  if (values.some(value => value === key)) return 0;
  if (values.some(value => value.startsWith(key))) return 1;
  return 2;
}

function lookupCandidateMatchesGroup(candidate) {
  return lookupGroup === 'all' || candidate.group === lookupGroup;
}

function findLookupCandidates(raw) {
  const key = normalizeLookupValue(raw);
  const byId = new Map();

  for (const row of allLookupRankingRows()) {
    const nickname = normalizeLookupValue(row.name);
    const playerId = normalizeLookupValue(row.player_id);
    if (!playerId) continue;
    if (!nickname.includes(key) && !playerId.includes(key)) continue;
    byId.set(playerId, {
      player_id: row.player_id,
      name: row.name || '',
      real_name: identityFor(row.player_id)?.real_name || '',
      group: row.demo ? '' : (row.group || ''),
      region: row.region || '',
      demo: Boolean(row.demo)
    });
  }

  if (identityAuthorized && identityData?.players) {
    for (const [playerId, identity] of Object.entries(identityData.players)) {
      const realName = identity?.real_name || '';
      if (!normalizeLookupValue(realName).includes(key)) continue;
      const id = normalizeLookupValue(playerId);
      const ranking = lookupOfficialRankingInfo(playerId);
      const existing = byId.get(id) || {};
      byId.set(id, {
        player_id: playerId,
        name: existing.name || ranking?.name || '',
        real_name: realName,
        group: ranking?.group || existing.group || '',
        region: ranking?.region || existing.region || '',
        demo: Boolean(existing.demo && !ranking)
      });
    }
  }

  return [...byId.values()]
    .filter(lookupCandidateMatchesGroup)
    .sort((a, b) => lookupCandidateScore(a, key) - lookupCandidateScore(b, key)
      || String(a.real_name || a.name || a.player_id).localeCompare(String(b.real_name || b.name || b.player_id), 'zh-Hant'))
    .slice(0, 50);
}

// WCS 2027 filter reads the separately maintained, public invitation list.
// Do not limit results to the official points ranking: some invitees are unranked.
let wcs2027LookupRows = null;
let wcs2027LookupPending = null;
let wcs2027LookupRequest = 0;

function wcs2027LookupEnabled() {
  return Boolean(document.getElementById('wcs2027OnlyFilter')?.checked);
}

function loadWcs2027LookupRows() {
  if (wcs2027LookupRows) return Promise.resolve(wcs2027LookupRows);
  if (!wcs2027LookupPending) {
    wcs2027LookupPending = fetch('data/wcs_2027_invites.json?v=2.9.0-r1', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('資格名單 HTTP ' + response.status);
        return response.json();
      })
      .then(payload => {
        if (!payload?.players || typeof payload.players !== 'object') throw new Error('資格名單格式錯誤');
        const groupOrder = { Junior: 0, Senior: 1, Master: 2 };
        wcs2027LookupRows = Object.entries(payload.players)
          .filter(([id, info]) => /^tw\d+$/i.test(id) && info && typeof info === 'object' && info.status === 'invited')
          .map(([id, info]) => ({
            player_id: id.toLowerCase(),
            name: String(info.name || id),
            group: String(info.group || ''),
            place: String(info.place || '已獲邀'),
            rank: Number(info.rank || 999)
          }))
          .sort((a, b) => (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9)
            || a.rank - b.rank
            || a.name.localeCompare(b.name, 'zh-Hant'));
        return wcs2027LookupRows;
      })
      .catch(error => {
        wcs2027LookupPending = null; // Allow retry after a temporary network error.
        throw error;
      });
  }
  return wcs2027LookupPending;
}

function filterWcs2027LookupRows(rows, query = '', group = lookupGroup) {
  const key = normalizeLookupValue(query);
  return (rows || []).filter(candidate =>
    (group === 'all' || candidate.group === group)
    && (!key || normalizeLookupValue(candidate.name).includes(key)
      || normalizeLookupValue(candidate.player_id).includes(key))
  );
}

async function renderWcs2027Lookup() {
  const panel = document.getElementById('wcs2027LookupResults');
  const count = document.getElementById('wcs2027LookupCount');
  const list = document.getElementById('wcs2027LookupList');
  if (!panel || !count || !list) return;
  panel.hidden = !wcs2027LookupEnabled();
  const request = ++wcs2027LookupRequest;
  if (panel.hidden) return;

  if (!wcs2027LookupRows) {
    count.textContent = '讀取名單中…';
    list.innerHTML = '<div class="wcs2027-lookup-empty">正在載入資格選手…</div>';
  }

  try {
    const rows = await loadWcs2027LookupRows();
    if (request !== wcs2027LookupRequest || !wcs2027LookupEnabled()) return;
    const query = document.getElementById('playerIdInput')?.value || '';
    const matched = filterWcs2027LookupRows(rows, query);
    count.textContent = '找到 ' + matched.length + ' 位';
    list.innerHTML = matched.length
      ? matched.map(candidate => `
        <button class="wcs2027-lookup-person" type="button" data-wcs2027-player-id="${esc(candidate.player_id)}">
          <span class="wcs2027-lookup-person-main">
            <strong>${esc(candidate.name)}</strong>
            <small>${esc(candidate.player_id)}</small>
          </span>
          <span class="wcs2027-lookup-person-meta">
            <span>${esc(LOOKUP_GROUP_LABELS[candidate.group] || candidate.group)}</span>
            <strong>${esc(candidate.place)}</strong>
          </span>
        </button>`).join('')
      : '<div class="wcs2027-lookup-empty">沒有符合條件的 WCS 2027 資格選手，請換個組別、姓名或 PTCG ID。</div>';
  } catch (error) {
    if (request !== wcs2027LookupRequest || !wcs2027LookupEnabled()) return;
    console.warn('WCS 2027 資格查詢失敗', error);
    count.textContent = '無法載入';
    list.innerHTML = '<div class="wcs2027-lookup-empty">資格名單載入失敗，請重新勾選再試一次。</div>';
  }
}

function showLookupMessage(title, message) {
  openModalShell();
  modalTitle.textContent = title;
  modalUpdated.textContent = '';
  modalBody.innerHTML = `
    <div class="detail-unavailable">
      <strong>${esc(title)}</strong>
      <p>${esc(message)}</p>
    </div>`;
}

function showLookupCandidates(query, candidates) {
  openModalShell();
  modalTitle.textContent = `搜尋「${query}」`;
  modalUpdated.textContent = `找到 ${candidates.length} 位符合玩家`;

  const items = candidates.map(candidate => {
    const primary = candidate.real_name || candidate.name || candidate.player_id;
    const nickname = candidate.name && candidate.name !== primary ? candidate.name : '';
    const groupLabel = candidate.group ? (GROUP_LABELS[candidate.group] || candidate.group) : '組別待官方排名確認';
    const meta = [candidate.player_id, groupLabel, candidate.region || '']
      .filter(Boolean)
      .join(' · ');
    return `
      <button class="secondary-btn lookup-candidate" type="button" data-lookup-player-id="${esc(candidate.player_id)}">
        <span class="lookup-candidate-main">
          <strong>${esc(primary)}</strong>
          ${nickname ? `<small>${esc(nickname)}</small>` : ''}
        </span>
        <span class="lookup-candidate-meta">${esc(meta)}</span>
      </button>`;
  }).join('');

  modalBody.innerHTML = `
    <div class="lookup-results-note">若有多位玩家，請依 PTCG ID 或目前排名資料選擇正確的人。</div>
    <div class="lookup-results">${items}</div>`;

  modalBody.querySelectorAll('[data-lookup-player-id]').forEach(button => {
    button.addEventListener('click', () => openPlayerModal(button.dataset.lookupPlayerId));
  });
}

async function handlePlayerLookup(event) {
  event.preventDefault();
  if (wcs2027LookupEnabled()) {
    await renderWcs2027Lookup();
    return;
  }
  const input = document.getElementById('playerIdInput');
  const raw = input?.value.trim() || '';
  if (!raw) return;

  const compact = raw.replace(/\s+/g, '');
  if (/^tw\d+$/i.test(compact)) {
    const ranking = lookupOfficialRankingInfo(compact);
    if (lookupGroup !== 'all') {
      const selectedGroupLabel = LOOKUP_GROUP_LABELS[lookupGroup] || lookupGroup;
      if (!ranking?.group) {
        showLookupMessage('組別尚待確認', `這位玩家目前尚未出現在本季官方排名，因此無法確認是否屬於${selectedGroupLabel}。請切換「全部」查詢。`);
        return;
      }
      if (ranking.group !== lookupGroup) {
        showLookupMessage('找不到符合的玩家', `此 PTCG ID 不在目前官方排名的${selectedGroupLabel}資料中。`);
        return;
      }
    }
    await openPlayerModal(compact.toLowerCase());
    return;
  }

  const candidates = findLookupCandidates(raw);
  if (candidates.length === 1) {
    await openPlayerModal(candidates[0].player_id);
    return;
  }
  if (candidates.length > 1) {
    showLookupCandidates(raw, candidates);
    return;
  }

  if (lookupGroup !== 'all') {
    const selectedGroupLabel = LOOKUP_GROUP_LABELS[lookupGroup] || lookupGroup;
    showLookupMessage('找不到符合的玩家', `找不到目前已由本季官方排名確認為${selectedGroupLabel}的玩家。尚未出現在本季排名的玩家，請切換「全部」查詢。`);
    return;
  }

  if (!identityAuthorized) {
    showLookupMessage('找不到符合的玩家', '請確認暱稱或 PTCG ID 是否正確。');
    return;
  }

  showLookupMessage('找不到符合的玩家', '請確認姓名、暱稱或 PTCG ID 是否正確。');
}

(function setupAdvancedLookupToggle() {
  const toggle = document.getElementById('advancedLookupToggle');
  const panel = document.getElementById('advancedPlayerLookup');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    toggle.textContent = opening ? '進階查詢⌃' : '進階查詢⌄';
    if (opening) requestAnimationFrame(() => document.getElementById('playerIdInput')?.focus());
  });
})();

(function setupEnhancedPlayerLookup() {
  document.querySelectorAll('[data-lookup-group]').forEach(button => {
    button.addEventListener('click', () => {
      lookupGroup = button.dataset.lookupGroup || 'all';
      document.querySelectorAll('[data-lookup-group]').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (wcs2027LookupEnabled()) void renderWcs2027Lookup();
    });
  });

  const oldForm = document.getElementById('playerLookupForm');
  if (!oldForm) return;

  const form = oldForm.cloneNode(true);
  oldForm.replaceWith(form);
  form.addEventListener('submit', handlePlayerLookup);

  const filter = document.getElementById('wcs2027OnlyFilter');
  const input = form.querySelector('#playerIdInput');
  const hint = document.getElementById('playerLookupHint');
  filter?.addEventListener('change', () => {
    if (hint) hint.hidden = filter.checked;
    if (input) input.placeholder = filter.checked ? '搜尋 WCS 2027 姓名 / PTCG ID' : '姓名 / 暱稱 / PTCG ID';
    void renderWcs2027Lookup();
  });
  input?.addEventListener('input', () => {
    if (wcs2027LookupEnabled()) void renderWcs2027Lookup();
  });
  document.getElementById('wcs2027LookupList')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-wcs2027-player-id]');
    if (button) void openPlayerModal(button.dataset.wcs2027PlayerId);
  });
})();

(function setupPairingNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav || nav.querySelector('a[href="pairing.html"]')) return;
  const link = document.createElement('a');
  link.href = 'pairing.html';
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v3h3v4h-3v3h-4v3h-2v-3H7v-3H4V7h3V4Zm2 2v6h6V6H9Zm-3 3v0h1V9H6Zm11 0v0h1V9h-1Z"/></svg>即時配對';
  const actions = nav.querySelector('.site-nav-actions');
  nav.insertBefore(link, actions || null);

  const notice = document.querySelector('.notice strong');
  if (notice && /目前為 v/i.test(notice.textContent || '')) notice.textContent = '目前為 v0.11.0 測試版';
})();
