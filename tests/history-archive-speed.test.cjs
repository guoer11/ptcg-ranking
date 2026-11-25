'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('pairing-match-archive.js','utf8');
const backend=fs.readFileSync('supabase/functions/ptcg-pairing-archive/index.ts','utf8');
assert.match(backend,/const \[ev,list,selected,final,knockout,interim\]=await Promise\.all/,'independent archive data fetched in parallel');
assert.match(backend,/Promise\.all\(identityQueries\)/,'parallel identity and deck context');
assert.match(source,/const CACHE_MS=90\*1000/);
const nodes=new Map(), listeners={}, dispatched=[],calls=[];
function el(id) {
  if(!nodes.has(id)) {
    const item={id,dataset:{},value:'',open:id==='matchArchive',hidden:false,
      disabled:false,textContent:'',handlers:{},
      addEventListener(name,fn){this.handlers[name]=fn;}};
    let html='';
    Object.defineProperty(item,'innerHTML',{
      get(){return html;},
      set(next){html=String(next);if(id==='matchArchiveEvent'||id==='matchArchiveRound'){
        item.value=/value="([^"]+)"/.exec(html)?.[1]||'';
      }}
    });
    nodes.set(id,item);
  }
  return nodes.get(id);
}
const document={readyState:'loading',getElementById:el,
  addEventListener(name,fn){listeners[name]=fn;},
  dispatchEvent(ev){dispatched.push(ev);}
};
class CustomEvent {constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
const mockArchives=[
  {tid:'5865462',title:'2026/11/21 UBL 1-4 孩童組',last_round:7,final_seen_at:'2026-11-21T08:00:00Z'},
  {tid:'8123029',title:'2026/10/17 UBL 1-3 孩童組',last_round:6,final_seen_at:'2026-10-17T08:00:00Z'}
];
function archive(tid,round){
  const standings=[{rank:1,id:'tw33000082',name:'選手A',points:18}];
  return {event:{tid,title:'2026/11/21 UBL 孩童組',status:'completed',final_seen_at:'2026-11-21T08:00:00Z'},
    rounds:[{round_no:1,table_count:12},{round_no:7,table_count:6}],
    final:{standings,source_status:'official',captured_at:'2026-11-21T09:00:00Z'},
    selected:round?{round_no:round,matches:[],captured_at:'2026-11-21T07:00:00Z'}:null,
    interim:null,context:{real_names:{},decks:{tw33000082:{current:{deck:'測試牌組',round:1}}},observations:{}}};
}
const fetch=async (_url,options)=>{
  const input=JSON.parse(options.body);calls.push(input);
  const data=input.action==='list'?{ok:true,archives:mockArchives}
    :input.action==='get'?{ok:true,archive:archive(input.tid,input.round)}
    :{ok:true};
  return {ok:true,json:async()=>data};
};
const context={window:{},document,CustomEvent,fetch,
  pairingSession:{user:{id:'owner'},access_token:'token'},pairingAuthorized:true,
  console,Date,Map,Set,Array,Number,String,Object};
vm.runInNewContext(source,context,{filename:'pairing-match-archive.js'});
listeners.DOMContentLoaded();
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
const getCalls=()=>calls.filter(call=>call.action==='get').length;
(async()=>{
  listeners['pairing:auth-ready']({detail:{allowed:true}});
  await settle();
  assert.equal(calls.filter(c=>c.action==='list').length,1,'one list load');
  assert.equal(getCalls(),1,'first event needs only ONE GET, not two');
  assert.equal(calls.find(c=>c.action==='get').round,null,'finished event defaults to final ranking');

  const rendered=el('matchArchiveRows').innerHTML;
  assert.match(rendered,/<th>名次<\/th><th>選手<\/th><th>牌組<\/th><th>TtlScore<\/th>/);
  const firstRow=rendered.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/)[1];
  const cells=[...firstRow.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(x=>x[1]);
  assert.equal(cells.length,4,'standings has four actual cells on all viewports');
  assert.equal(cells[0],'1');
  assert.match(cells[1],/選手A[\s\S]*tw33000082/);
  assert.doesNotMatch(cells[1],/archive-deck/);
  assert.match(cells[2],/測試牌組[\s\S]*記錄於 Round 1/);
  assert.equal(cells[3],'18');
  assert.match(rendered,/測試牌組/);
  assert.match(rendered,/記錄於 Round 1/);
  assert.match(rendered,/<td>18<\/td>/,'preserve points');
  el('matchArchiveRound').value='1';
  el('matchArchiveRound').handlers.change();
  await settle();
  assert.equal(getCalls(),2,'first viewing a new round fetches one record');
  assert.equal(calls.filter(c=>c.action==='get').at(-1).round,1,'numeric round must remain a number');

  el('matchArchiveRound').value='final';
  el('matchArchiveRound').handlers.change();
  await settle();
  assert.equal(getCalls(),2,'revisiting final ranking uses private memory cache');

  el('matchArchiveEvent').value='8123029';
  el('matchArchiveEvent').handlers.change({target:el('matchArchiveEvent')});
  await settle();
  assert.equal(getCalls(),3,'another event fetched once');

  el('matchArchiveEvent').value='5865462';
  el('matchArchiveEvent').handlers.change({target:el('matchArchiveEvent')});
  await settle();
  assert.equal(getCalls(),3,'recently viewed event uses cache, no extra GET');

  el('matchArchiveRefresh').handlers.click();
  await settle();
  assert.equal(calls.filter(c=>c.action==='list').length,2,'manual refresh requests a new list');
  assert.equal(getCalls(),4,'manual refresh bypasses the cache');

  listeners['pairing:auth-ready']({detail:{allowed:false}});
  listeners['pairing:auth-ready']({detail:{allowed:true}});
  await settle();
  assert.equal(getCalls(),5,'sign-out clears private cached event data');
  console.log('PASS: single initial archive GET, numeric round, in-memory revisit, explicit refresh, logout invalidation');
})().catch(e=>{console.error(e);process.exitCode=1;});
