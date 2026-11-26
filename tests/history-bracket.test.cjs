'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('history.html'),css=read('history-center.css');
const frontend=read('history-knockout.js');
const backend=read('supabase/functions/ptcg-pairing-archive/index.ts');
assert.match(html,/id="historyKnockoutBracket"/);
assert.match(html,/<details id="historyKnockoutPanel" class="history-knockout pairing-history-panel" hidden>\s*<summary>TOP8 複賽對戰樹<\/summary>/);
assert.doesNotMatch(html,/<details id="historyKnockoutPanel"[^>]*\bopen\b/,'bracket defaults to collapsed');
assert.match(html,/<\/details>\s*<details id="historyKnockoutPanel"/,'bracket is an independent sibling of archive');
assert.match(html,/<\/details>\s*<\/details>\s*<\/section>/,'legacy controls remain inside collapsible bracket');
assert.match(css,/\.history-knockout\[hidden\]\{display:none!important\}/);
assert.match(css,/\.history-panel #historyKnockoutPanel>summary/);
assert.match(html,/id="historyBracketSave"/);
assert.doesNotMatch(html,/id="historyBracketCopy"/,'copy should use normal text selection without a copy button');
assert.match(frontend,/history-bracket-copytext/,'name and PTCG ID should remain text selectable');
assert.match(frontend,/class="history-bracket-result"/,'winner selection should be a separate control');
assert.match(css,/user-select:text/,'allow selecting player text on desktop and mobile');
assert.match(html,/history-knockout\.js\?v=\d+\.\d+\.\d+/, 'knockout JS must use a versioned asset URL');
assert.match(css,/history-bracket-columns/);
assert.match(css,/@media\(max-width:760px\)/);
assert.match(backend,/async function saveKnockoutBracket/);
assert.match(backend,/action==="save-knockout-bracket"/);
assert.match(backend,/const complete=BRACKET_KEYS\.every/);
assert.match(backend,/if\(complete&&!conflict\)\{/);
assert.match(backend,/await requireMember\(req\)/);
assert.match(backend,/bracket:\{version:2,winners,updated_at:now\(\)/);

const elements={};
const eventCallbacks={};
const makeEl=id=>({
  id,dataset:{},hidden:false,innerHTML:'',disabled:false,value:'',
  handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}
});
const document={
  readyState:'loading',
  getElementById(id){return elements[id]||(elements[id]=makeEl(id));},
  addEventListener(name,fn){eventCallbacks[name]=fn;}
};
const people=Array.from({length:9},(_,i)=>({
  rank:i+1,id:'tw'+String(i+1).padStart(8,'0'),name:'選手'+(i+1)
}));
const calls=[];
async function fetchMock(url,options={}){
  let data;
  if(String(url).includes('preliminary_sources.json'))data={sources:[{tid:'5865462',event_id:'66990',group:'Junior',league:'Ultra'}]};
  else if(String(url).includes('knockout_results.json'))data={events:{}};
  else if(String(url).includes('tournaments.json'))data={events:[{event_id:'66990',group:'Junior',league:'Ultra'}]};
  else {
    data={ok:true,complete:calls.length===0,confirmed:calls.length===0?7:5,sync_triggered:true};
    calls.push(JSON.parse(options.body));
  }
  return {ok:true,json:async()=>data};
}
const context={
  window:{},document,fetch:fetchMock,console,
  pairingAuthorized:true,pairingAccessRole:'admin',pairingSession:{access_token:'mock-session'},
  Date,Set,Map,Object,Number,String,Array,
};
vm.runInNewContext(frontend,context,{filename:'history-knockout.js'});
eventCallbacks.DOMContentLoaded();
const archive={
  event:{tid:'5865462',title:'2026/11/21 UBL 1-4 孩童組',final_seen_at:'2026-11-21T06:45:00Z'},
  final:{standings:people},
  context:{real_names:{},decks:{
    tw00000001:{current:{deck:'多龍火雞',round:4}},
    tw00000008:{previous:{deck:'上一場舊牌組'}},
    tw00000004:{current:{deck:'夢幻<測試>'}}
  }},
  knockout:{podium:{results:[]}}
};
eventCallbacks['archive:loaded']({detail:{archive,tid:'5865462'}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
  await settle();
  assert.equal(elements.historyKnockoutPanel.hidden,false);
  assert.match(elements.historyKnockoutBracket.innerHTML,/第1名/);
  assert.match(elements.historyKnockoutBracket.innerHTML,/第8名/);
  assert.match(elements.historyKnockoutBracket.innerHTML,/多龍火雞/,'show same-event recorded deck');
  assert.match(elements.historyKnockoutBracket.innerHTML,/夢幻&lt;測試&gt;/,'escape recorded deck label');
  assert.doesNotMatch(elements.historyKnockoutBracket.innerHTML,/上一場舊牌組/,'never show historical deck as current deck');
  const click=(key,id)=>{
    elements.historyKnockoutBracket.handlers.click({
      target:{closest:()=>({dataset:{bracketPick:key,playerId:id}})}
    });
  };
  const id=rank=>'tw'+String(rank).padStart(8,'0');
  click('qf1',id(1));click('qf2',id(4));
  click('qf3',id(3));click('qf4',id(2));
  click('sf1',id(1));click('sf2',id(2));click('final',id(1));
  assert.match(elements.historyKnockoutBracket.innerHTML,/已確認 7 \/ 7 場/);
  assert.match(elements.historyKnockoutBracket.innerHTML,/🏆 冠軍/);
  assert.equal(elements.historyKnockoutLegacy.hidden,true);
  elements.historyBracketSave.handlers.click();
  await settle();
  assert.equal(calls.length,1);
  assert.equal(calls[0].action,'save-knockout-bracket');
  assert.equal(calls[0].winners.final,id(1));
  assert.match(elements.historyBracketStatus.textContent,/冠亞軍及 LP/);

  click('qf1',id(8)); // Correct an earlier winner: affected SF and final must be cleared.
  assert.match(elements.historyKnockoutBracket.innerHTML,/已確認 5 \/ 7 場/);
  elements.historyBracketSave.handlers.click();
  await settle();
  assert.equal(calls.length,2);
  assert.equal(calls[1].winners.qf1,id(8));
  assert.equal(calls[1].winners.sf1,'');
  assert.equal(calls[1].winners.final,'');
  assert.equal(calls[1].winners.sf2,id(2));
  context.pairingAccessRole='guest';eventCallbacks['archive:loaded']({detail:{archive,tid:'5865462'}});await settle();
  assert.equal(elements.historyBracketSave.hidden,true);assert.doesNotMatch(elements.historyKnockoutBracket.innerHTML,/data-bracket-pick=/);
  click('qf1',id(1));elements.historyBracketSave.handlers.click();await settle();assert.equal(calls.length,2,'guest history cannot write');
  console.log('PASS: TOP8 seeds, partial results, complete sync, downstream correction and private archive controls');
})().catch(e=>{console.error(e);process.exitCode=1;});
