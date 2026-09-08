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
    const meta = [candidate.player_id, GROUP_LABELS[candidate.group] || '', candidate.region || '']
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
    <div class="lookup-results-note">若有同名玩家，請依 PTCG ID 或目前排名資料選擇正確的人。</div>
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

  if (!identityAuthorized) {
    const message = identitySession
      ? '目前沒有可用的私人姓名資料；若剛登入請稍等一下再搜尋。'
      : '目前找不到公開排名中的暱稱。若要用真實姓名搜尋，請先按右上角帳號圖示登入。';
    showLookupMessage('找不到符合的玩家', message);
    return;
  }

  showLookupMessage('找不到符合的玩家', '請確認姓名、暱稱或 PTCG ID 是否正確。');
}

(function setupEnhancedPlayerLookup() {
  const oldForm = document.getElementById('playerLookupForm');
  if (!oldForm) return;

  const form = oldForm.cloneNode(true);
  oldForm.replaceWith(form);
  form.addEventListener('submit', handlePlayerLookup);
})();
