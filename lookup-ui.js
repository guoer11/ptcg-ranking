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
    });
  });

  const oldForm = document.getElementById('playerLookupForm');
  if (!oldForm) return;

  const form = oldForm.cloneNode(true);
  oldForm.replaceWith(form);
  form.addEventListener('submit', handlePlayerLookup);
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
