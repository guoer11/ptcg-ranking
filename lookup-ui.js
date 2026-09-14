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
      group: row.group || '',
      region: row.region || ''
    });
  }

  if (identityAuthorized && identityData?.players) {
    for (const [playerId, identity] of Object.entries(identityData.players)) {
      const realName = identity?.real_name || '';
      if (!normalizeLookupValue(realName).includes(key)) continue;
      const id = normalizeLookupValue(playerId);
      const ranking = lookupRankingInfo(playerId);
      const existing = byId.get(id) || {};
      byId.set(id, {
        player_id: playerId,
        name: existing.name || ranking?.name || '',
        real_name: realName,
        group: existing.group || ranking?.group || '',
        region: existing.region || ranking?.region || ''
      });
    }
  }

  return [...byId.values()]
    .filter(lookupCandidateMatchesGroup)
    .sort((a, b) => lookupCandidateScore(a, key) - lookupCandidateScore(b, key)
      || String(a.real_name || a.name || a.player_id).localeCompare(String(b.real_name || b.name || b.player_id), 'zh-Hant'))
    .slice(0, 50);
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
  const input = document.getElementById('playerIdInput');
  const raw = input?.value.trim() || '';
  if (!raw) return;

  const compact = raw.replace(/\s+/g, '');
  if (/^tw\d+$/i.test(compact)) {
    const ranking = lookupRankingInfo(compact);
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

(function setupEnhancedPlayerLookup() {
  document.querySelectorAll('[data-lookup-group]').forEach(button => {
    button.addEventListener('click', () => {
      lookupGroup = button.dataset.lookupGroup || 'all';
      document.querySelectorAll('[data-lookup-group]').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    });
  });

  const oldForm = document.getElementById('playerLookupForm');
  if (!oldForm) return;

  const form = oldForm.cloneNode(true);
  oldForm.replaceWith(form);
  form.addEventListener('submit', handlePlayerLookup);
})();
