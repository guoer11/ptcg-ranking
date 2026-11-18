'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const from = source.indexOf('function mergePlayerDetailWithLatestRanking(data) {');
const to = source.indexOf('\nfunction renderPlayerDetail(data, calculatedEvents = null) {', from);
assert(from !== -1 && to !== -1, 'current-ranking merge helper must exist');
assert.match(source, /renderPlayerDetail\(mergePlayerDetailWithLatestRanking\(data\), calculatedEvents\)/,
  'real player modal must use the corrected ranking data');

const rankingData = {
  updated_at: '2026-11-18T00:05:23+08:00',
  groups: {
    Junior: [
      { player_id: 'tw64474352', name: 'Yule', points: 30, rank: 21, region: '高雄市' }
    ],
    Senior: [],
    Master: []
  }
};
const context = { rankingData, GROUP_LABELS: { Junior: '孩童組', Senior: '少年組', Master: '大師組' } };
const merge = vm.runInNewContext(source.slice(from, to) + '\nmergePlayerDetailWithLatestRanking;', context);

const stale = {
  player_id: 'tw64474352',
  name: 'Yule',
  official_points: 6,
  updated_at: '2026-09-25T06:13:55+08:00',
  group: 'Junior',
  group_label: '孩童組',
  region: '高雄市',
  events: [{ name: 'old event', points: 6 }]
};
const result = merge(stale);
assert.equal(result.official_points, 30, 'Yule should display 30pt, not stale 6pt');
assert.equal(result.updated_at, rankingData.updated_at, 'date reflects current ranking snapshot');
assert.equal(result.group, 'Junior');
assert.equal(result.region, '高雄市');
assert.equal(result.events.length, 1, 'historical details are not destructively modified');
assert.equal(stale.official_points, 6, 'source file remains unchanged');

const noRanking = merge({ player_id: 'tw11111111', official_points: 99 });
assert.equal(noRanking.official_points, null, 'never present stale points as current if off leaderboard');

rankingData.groups.Junior[0].points = 0;
assert.equal(merge(stale).official_points, 0, 'real official 0 is preserved');
rankingData.groups.Junior[0].points = 30;

const demo = { ...stale, demo: true };
assert.equal(merge(demo), demo, 'legacy demonstration entries must remain unchanged');

const latest = JSON.parse(fs.readFileSync('data/ranking.json', 'utf8'));
const liveRow = latest.groups.Junior.find(row => row.player_id === 'tw64474352');
assert(liveRow, 'Yule must have a current official ranking entry in fixture');
context.rankingData = latest;
assert.equal(merge(stale).official_points, liveRow.points, 'player detail must follow newest official points');

console.log('Player details: stale snapshot 6 -> latest official points, missing/zero/demo cases OK');
