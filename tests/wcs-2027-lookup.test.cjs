'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const entries = JSON.parse(fs.readFileSync('data/wcs_2027_invites.json', 'utf8'));
const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /id="wcs2027OnlyFilter"/);
assert.match(html, /id="wcs2027LookupResults"/);
assert.match(html, /lookup-ui\.js\?v=2\.9\.0-r1/);

const context = vm.createContext({
  document: {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  },
  console,
  fetch: async url => {
    assert.match(url, /data\/wcs_2027_invites\.json/);
    return { ok: true, json: async () => entries };
  }
});
vm.runInContext(fs.readFileSync('lookup-ui.js', 'utf8'), context);

(async () => {
  const load = vm.runInContext('loadWcs2027LookupRows', context);
  const filter = vm.runInContext('filterWcs2027LookupRows', context);
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
  console.log('WCS 2027 lookup: 12 invitees, group, name and PTCG ID filters OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
