'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const invitations = JSON.parse(fs.readFileSync('data/wcs_2027_invites.json', 'utf8'));
const html = fs.readFileSync('index.html', 'utf8');
const renderer = fs.readFileSync('ranking-season-ui.js', 'utf8');
assert.match(html, /id="wcs2027OnlyFilter"/);
assert.match(html, /aria-controls="rankingContainer"/);
assert.doesNotMatch(html, /id="wcs2027LookupResults"/);
assert.match(html, /lookup-ui\.js\?v=2\.9\.0-r2/);
assert.match(html, /ranking-season-ui\.js\?v=2\.9\.0-r2/);
assert.match(renderer, /renderWcs2027RankingTable\(\)/);

const rankingContainer = { innerHTML: '' };
const filterToggle = { checked: true };
const search = { value: '' };
const advancedSearch = { value: '' };
const rankingMode = { hidden: false };
const projectionNotice = { hidden: false };
const elements = {
  rankingContainer,
  wcs2027OnlyFilter: filterToggle,
  rankingSearch: search,
  playerIdInput: advancedSearch,
  rankingModeSwitch: rankingMode,
  rankingProjectionNotice: projectionNotice
};
const rankingData = {
  groups: {
    Junior: [
      { player_id: 'tw46877625', name: 'nickname', points: 50, rank: 91, region: '臺南市' },
      { player_id: 'tw99999999', name: 'not invited', points: 800, rank: 1, region: '臺北市' }
    ],
    Senior: [],
    Master: []
  }
};
const context = vm.createContext({
  document: {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: id => elements[id] || null
  },
  rankingData,
  activeGroup: 'Junior',
  GROUP_LABELS: { Junior: '孩童組', Senior: '少年組', Master: '大師組' },
  identityFor: () => null,
  playerNameHtml: row => '<div class="row-id">' + row.player_id + '</div><strong>' + row.name + '</strong>',
  detailButton: id => '<button data-player-id="' + id + '">詳細</button>',
  bindDetailButtons: () => {},
  esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  console,
  fetch: async url => {
    assert.match(url, /data\/wcs_2027_invites\.json/);
    return { ok: true, json: async () => invitations };
  }
});
vm.runInContext(fs.readFileSync('lookup-ui.js', 'utf8'), context);

(async () => {
  const load = vm.runInContext('loadWcs2027LookupRows', context);
  const filter = vm.runInContext('filterWcs2027LookupRows', context);
  const render = vm.runInContext('renderWcs2027RankingTable', context);
  const people = await load();
  assert.equal(people.length, 12, 'all 12 known invitees must be listed');
  assert.equal(new Set(people.map(p => p.player_id)).size, 12, 'PTCG IDs must be unique');
  for (const group of ['Junior', 'Senior', 'Master']) {
    assert.equal(filter(people, '', group).length, 4, group + ' should contain four invitees');
  }
  assert.equal(filter(people, '陳鉑岳', 'all')[0].player_id, 'tw46877625');
  assert.equal(filter(people, 'tw46877625', 'Junior')[0].name, '陳鉑岳');
  assert.equal(filter(people, 'tw46877625', 'Senior').length, 0);
  assert.equal(filter(people, '李宥緯', 'Senior')[0].player_id, 'tw81124094');
  assert.equal(filter(people, '不存在的選手', 'all').length, 0);
  assert.equal(filter(people, 'TW25007020', 'all')[0].name, '許辰銨');

  render();
  assert.equal((rankingContainer.innerHTML.match(/<tr>\s*<td>/g) || []).length, 4, 'Junior should have four table rows');
  assert.match(rankingContainer.innerHTML, /tw46877625/);
  assert.match(rankingContainer.innerHTML, /tw25007020/);
  assert.match(rankingContainer.innerHTML, /<span class="rank-badge">91<\/span>/);
  assert.doesNotMatch(rankingContainer.innerHTML, /tw99999999/, 'non-invited official player excluded');
  assert.doesNotMatch(rankingContainer.innerHTML, /許雲翔/, 'Senior player excluded');
  assert.equal(rankingMode.hidden, true, 'rank mode hidden only in WCS filter view');

  context.activeGroup = 'Senior';
  render();
  assert.equal((rankingContainer.innerHTML.match(/<tr>\s*<td>/g) || []).length, 4, 'Senior should have four table rows');
  assert.match(rankingContainer.innerHTML, /tw81124094/);
  assert.doesNotMatch(rankingContainer.innerHTML, /tw46877625/);

  context.activeGroup = 'Master';
  render();
  assert.equal((rankingContainer.innerHTML.match(/<tr>\s*<td>/g) || []).length, 4, 'Master should have four table rows');
  assert.match(rankingContainer.innerHTML, /tw35477925/);

  context.activeGroup = 'Junior';
  advancedSearch.value = '許辰銨';
  render();
  assert.equal((rankingContainer.innerHTML.match(/<tr>\s*<td>/g) || []).length, 1);
  assert.match(rankingContainer.innerHTML, /tw25007020/);
  advancedSearch.value = '';
  search.value = 'tw46877625';
  render();
  assert.equal((rankingContainer.innerHTML.match(/<tr>\s*<td>/g) || []).length, 1);
  assert.match(rankingContainer.innerHTML, /tw46877625/);

  console.log('WCS 2027 ranking filter: 12 invitees, three groups, details, name and ID filters OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
