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

// WCS 2027 is a filter of the EXISTING ranking table, not a separate list.
// Invitation records are independent of current official ranking membership.
let wcs2027LookupRows = null;
let wcs2027LookupPending = null;
let wcs2027LookupError = null;

function wcs2027LookupEnabled() {
  return Boolean(document.getElementById('wcs2027OnlyFilter')?.checked);
}

function loadWcs2027LookupRows() {
  if (wcs2027LookupRows) return Promise.resolve(wcs2027LookupRows);
  if (!wcs2027LookupPending) {
    wcs2027LookupError = null;
    wcs2027LookupPending = fetch('data/wcs_2027_invites.json?v=2.9.0-r2', { cache: 'no-store' })
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
        wcs2027LookupError = error;
        wcs2027LookupPending = null;
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

// Called only by ranking-season-ui.js when the checkbox is selected.
// Reuses ranking-table markup, playerNameHtml, detailButton, and legacy badge observers.
function renderWcs2027RankingTable() {
  const root = document.getElementById('rankingContainer');
  if (!root) return;
  const mode = document.getElementById('rankingModeSwitch');
  if (mode) mode.hidden = true;
  const projectionNotice = document.getElementById('rankingProjectionNotice');
  if (projectionNotice) projectionNotice.hidden = true;

  if (!wcs2027LookupRows) {
    root.innerHTML = `<div class="empty-state"><strong>${wcs2027LookupError ? '無法載入 WCS 2027 資格資料' : '正在讀取 WCS 2027 資格資料…'}</strong><span>${wcs2027LookupError ? '請取消勾選後重新勾選，再試一次。' : '資料會顯示在原本排行榜。'}</span></div>`;
    return;
  }

  const officialRows = rankingData?.groups?.[activeGroup] || [];
  const byId = new Map(officialRows.map(row => [normalizeLookupValue(row.player_id), row]));
  const searchTerms = [
    document.getElementById('rankingSearch')?.value,
    document.getElementById('playerIdInput')?.value
  ].map(normalizeLookupValue).filter(Boolean);

  const entries = filterWcs2027LookupRows(wcs2027LookupRows, '', activeGroup)
    .map(person => {
      const ranking = byId.get(normalizeLookupValue(person.player_id)) || null;
      const names = [person.name, person.player_id, ranking?.name, ranking?.region, identityFor(person.player_id)?.real_name];
      const text = names.map(normalizeLookupValue).join(' ');
      return { person, ranking, matches: searchTerms.every(term => text.includes(term)) };
    })
    .filter(entry => entry.matches)
    .sort((a, b) => {
      const numericRank = entry => {
        const value = Number(entry.ranking?.rank);
        return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
      };
      return numericRank(a) - numericRank(b)
        || a.person.rank - b.person.rank
        || a.person.name.localeCompare(b.person.name, 'zh-Hant');
    });

  if (!entries.length) {
    root.innerHTML = `<div class="empty-state"><strong>${esc(GROUP_LABELS[activeGroup])}沒有符合搜尋條件的 WCS 2027 資格選手</strong><span>請更換搜尋條件或切換組別。</span></div>`;
    return;
  }

  const rows = entries.map(({ person, ranking }) => {
    // Invitee name is known even when the user has no current ranking entry.
    const row = { ...(ranking || {}), player_id: person.player_id, name: person.name };
    const rank = ranking?.rank ?? '—';
    const points = ranking?.points ?? '—';
    return `<tr>
      <td><span class="rank-badge">${esc(rank)}</span></td>
      <td>${playerNameHtml(row)}</td>
      <td>${esc(points)}${points === '—' ? '' : ' pt'}</td>
      <td>${esc(GROUP_LABELS[activeGroup])}</td>
      <td>${esc(ranking?.region || '—')}</td>
      <td class="detail-col">${detailButton(person.player_id)}</td>
    </tr>`;
  }).join('');

  root.innerHTML = `<p class="wcs2027-ranking-note">WCS 2027 已獲邀選手｜${esc(GROUP_LABELS[activeGroup])} ${entries.length} 位 <small>未列入官方排名者以「—」顯示</small></p>
    <div class="table-scroll">
      <table class="ranking-table">
        <thead><tr><th>排名</th><th>玩家</th><th>得分</th><th>組別</th><th>地區</th><th aria-label="詳細資料"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  bindDetailButtons();
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
    renderRanking();
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
      // In qualification mode, the original ranking tabs select Junior/Senior/Master.
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
  const wcsHint = document.getElementById('wcs2027LookupHint');
  const groupTabs = document.querySelector('.lookup-group-tabs');
  filter?.addEventListener('change', () => {
    const checked = filter.checked;
    if (hint) hint.hidden = checked;
    if (wcsHint) wcsHint.hidden = !checked;
    if (groupTabs) groupTabs.hidden = checked;
    if (input) input.placeholder = checked ? '搜尋 WCS 2027 姓名 / PTCG ID' : '姓名 / 暱稱 / PTCG ID';
    if (!checked) {
      updateRankingModeButtons();
      renderRanking();
      return;
    }
    renderRanking();
    void loadWcs2027LookupRows()
      .then(() => { if (wcs2027LookupEnabled()) renderRanking(); })
      .catch(error => {
        console.warn('WCS 2027 資格查詢失敗', error);
        if (wcs2027LookupEnabled()) renderRanking();
      });
  });
  input?.addEventListener('input', () => {
    if (wcs2027LookupEnabled()) renderRanking();
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
