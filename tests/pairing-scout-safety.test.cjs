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
  '    isCurrentScout, samePairIds, pairDeckConsistent, invalidateScoutContext, searchScoutNames, renderNameCandidates, setQueryMode',
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
  normalizePlayerId: id => String(id || '').toLowerCase().trim(), window: {}, console,
  pairingAuthorized:true,pairingSession:{user:{id:'owner'},access_token:'mock-token'},
  fetch:async (_url,opts)=>{
    const body=JSON.parse(opts.body);
    assert.equal(body.action,'scout-roster');
    assert.equal(body.tid,new URL(urlField.value).searchParams.get('tid'));
    assert.equal(body.round,Number(roundField.value));
    return {ok:true,json:async()=>({ok:true,tid:body.tid,round:body.round,available:true,player_ids:['tw11111111','tw22222222']})};
  },
  pairingClient:{from(table){
    assert.equal(table,'player_identities');
    let scoped=false;
    const q={select(){return q;},in(column,ids){assert.equal(column,'player_id');assert.equal(Array.from(ids).join(','),'tw11111111,tw22222222');scoped=true;return q;},ilike(column,pattern){assert.equal(column,'real_name');assert.equal(pattern,'%王%');assert.equal(scoped,true);return q;},order(){return q;},then(resolve){return Promise.resolve({data:[{player_id:'tw11111111',real_name:'王小明'},{player_id:'tw22222222',real_name:'王小明'},{player_id:'tw99999999',real_name:'王其他場'}],error:null}).then(resolve);}};
    return q;
  }}
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

(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../pairing.html'),'utf8');
  assert.match(html,/data-pairing-scout-mode="name"/);
  const rows=await helpers.searchScoutNames('王');
  assert.equal(rows.length,2);
  assert.ok(!rows.some(row=>row.id==='tw99999999'),'exclude all nonparticipants before displaying candidates');
  assert.notEqual(rows[0].id,rows[1].id);
  helpers.renderNameCandidates(rows,'王');
  assert.match(resultBox.innerHTML,/tw11111111/);
  assert.match(resultBox.innerHTML,/tw22222222/);
  assert.doesNotMatch(resultBox.innerHTML,/tw99999999/);
  assert.match(resultBox.innerHTML,/data-scout-name-index="0"/);
  helpers.invalidateScoutContext();
  assert.doesNotMatch(resultBox.innerHTML,/data-scout-name-index/);
  await assert.rejects(helpers.searchScoutNames('%'),/有效/);
  console.log('PASS: name search, duplicate names, source change invalidation');
})().catch(e=>{console.error(e);process.exitCode=1;});
