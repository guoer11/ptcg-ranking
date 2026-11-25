'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('supabase/functions/ptcg-pairing-archive/index.ts');
const code=src.slice(src.indexOf('const BRACKET_KEYS='),src.indexOf('async function memberEvent('));
const ctx=vm.createContext({});
vm.runInContext(stripTypeScriptTypes(code,{mode:'transform'}),ctx);
const id=n=>'tw'+String(n).padStart(8,'0');
ctx.top=Array.from({length:8},(_,i)=>({rank:i+1,id:id(i+1)}));
ctx.zero=vm.runInContext('cleanWinners({})',ctx);
function merge(base,stored,incoming){ctx.base=base;ctx.stored=stored;ctx.incoming=incoming;return JSON.parse(JSON.stringify(vm.runInContext('mergeBracket(top,cleanWinners(base),cleanWinners(stored),cleanWinners(incoming))',ctx)));}
let r=merge({}, {qf1:id(1)}, {qf2:id(4)});
assert.equal(r.winners.qf1,id(1));assert.equal(r.winners.qf2,id(4));assert.equal(r.conflicts.length,0);
r=merge({}, {qf1:id(1)}, {qf1:id(1)});assert.equal(r.conflicts.length,0);
r=merge({}, {qf1:id(1)}, {qf1:id(8)});assert.deepEqual(r.conflicts,['qf1']);
r=merge({qf1:id(1),qf2:id(4)}, {qf1:id(8),qf2:id(4)}, {qf1:id(1),qf2:id(4),sf1:id(1)});assert.deepEqual(r.conflicts,['sf1']);
assert.match(src,/\.eq\("updated_at",existing.updated_at\)/);
assert.match(src,/reported_by:userId/);
assert.match(src,/if\(!admin\|\|!\["keep","adopt"\]/);
assert.match(src,/sync_pending:complete&&!conflict/);
assert.match(src,/async function retryTop8Sync/);
assert.match(src,/pending:"\+tid/);
assert.match(src,/action==="top8-live".*requireMember\(req,true\)/);
assert.match(src,/action==="register-tracked".*\.eq\("user_id",member.id\)/);
assert.match(src,/const member=await requireMember\(req\)/);
assert.match(read('supabase/functions/ptcg-github-trigger/index.ts'),/Top 8 conflict or incomplete bracket/);
for(const p of ['pairing.html','history.html']){
 assert.match(read(p),/id="historyKnockoutPanel"/);
 assert.match(read(p),/history-knockout\.js\?v=3\.0\.0-top8/);
}
assert.doesNotMatch(read('pairing.html'),/id="historyKnockoutLegacy"/);
const ui=read('history-knockout.js');
assert.match(ui,/base_winners:bracketBase/);
assert.match(ui,/pairing_top8_changes/);
assert.match(ui,/5000\)/);
console.log('PASS: concurrent same/different wins, dependency conflicts, scoped guest routes, auto LP retry, two-page shared UI');
