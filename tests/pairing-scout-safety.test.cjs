'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../pairing-deck-scout.js'), 'utf8');
assert(!source.includes('await deletePairObservation('), 'Switching or confirming a player must preserve unassigned pair notes');
const target = "  document.addEventListener('pairing:auth-ready', onAuthorized);";
assert.equal(source.split(target).length, 2);
const injection = [
  '  globalThis.__scoutSafety = {',
  '    setCurrent(data, parsed) { currentContext = { data, parsed }; },',
  '    isCurrentScout, samePairIds, pairDeckConsistent, invalidateScoutContext',
  '  };'
].join('\n') + '\n';
const injected = source.replace(target, injection + target);
const urlField = { value: 'https://tcg.sfc-jpn.jp/tourround.asp?tid=3832893&kno=2&znt=0' };
const roundField = { value: '2' };
const resultBox = { innerHTML: '', className: '' };
const statusBox = { textContent: '', className: '' };
const elements = { pairingScoutResult: resultBox, pairingScoutMessage: statusBox };
const sandbox = {
  document: { addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelectorAll() { return []; } },
  sourceInput: () => urlField, roundInput: () => roundField,
  normalizeRoundUrl(raw, override) { const url = new URL(raw); return { tid: url.searchParams.get('tid'), round: Number(override), url: url.toString() }; },
  normalizePlayerId: id => String(id || '').toLowerCase().trim(), window: {}, console
};
vm.runInNewContext(injected, sandbox, { filename: 'pairing-deck-scout.js' });
const helpers = sandbox.__scoutSafety;
const data = { tid: '3832893', round: 2 };
helpers.setCurrent(data, { tid: '3832893', round: 2 });
assert.equal(helpers.isCurrentScout(data), true);
roundField.value = '3';
assert.equal(helpers.isCurrentScout(data), false, 'Round changed');
helpers.invalidateScoutContext();
assert.match(resultBox.innerHTML, /舊配對已清除/);
assert.equal(helpers.isCurrentScout(data), false);
roundField.value = '2';
helpers.setCurrent(data, { tid: '3832893', round: 2 });
urlField.value = 'https://tcg.sfc-jpn.jp/tourround.asp?tid=60726&kno=2&znt=0';
assert.equal(helpers.isCurrentScout(data), false, 'Event TID changed');
assert.equal(helpers.samePairIds({ player_a_id:'tw11111111', player_b_id:'tw22222222' }, ['tw22222222','tw11111111']), true);
assert.equal(helpers.samePairIds({ player_a_id:'tw11111111', player_b_id:'tw33333333' }, ['tw22222222','tw11111111']), false);
assert.equal(helpers.pairDeckConsistent({ player_a_id:'tw1', player_b_id:'tw2', deck_a:'大鳥胡地', deck_b:'多龍' }, new Map([['tw1','胡地']])), false);
assert.equal(helpers.pairDeckConsistent({ player_a_id:'tw1', player_b_id:'tw2', deck_a:'多龍', deck_b:'胡地' }, new Map([['tw1','胡地'],['tw2','多龍']])), true);
console.log('PASS pairing-scout safety: round/TID, stored IDs, conflicting decks, no implicit deletion');
