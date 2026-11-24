'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('player-badges.js','utf8');
assert.match(source,/maxlength="10"/);
assert.match(source,/\.eq\('user_id',userId\)\.eq\('player_id',id\)/);
assert.match(source,/Array\.from\(note\)\.length > NOTE_LIMIT/);
const events={};
const rows={owner:{tw12345678:'原本備註'},other:{tw12345678:'其他帳號'}};
let writeCount=0;
const client={from(table){
  assert.equal(table,'player_attention_marks');
  const filters={};let payload;
  const q={select(){return q;},eq(key,value){filters[key]=value;return q;},
    update(value){payload=value;return q;},
    maybeSingle(){writeCount++;rows[filters.user_id][filters.player_id]=payload.note;
      return Promise.resolve({data:{player_id:filters.player_id,note:payload.note},error:null});},
    then(resolve){return Promise.resolve({data:Object.entries(rows[filters.user_id]||{}).map(([player_id,note])=>({player_id,note})),error:null}).then(resolve);}
  };return q;
}};
const document={readyState:'loading',body:{},addEventListener(name,fn){events[name]=fn;},getElementById(){return null;}};
const window={setTimeout(){return 0;}};
const ctx={window,document,identityClient:client,identitySession:{user:{id:'owner'}},MutationObserver:class{observe(){}},clearTimeout(){},sessionStorage:{getItem(){return null;}},fetch:async()=>({ok:true,json:async()=>({players:{}}),text:async()=>''}),console};
vm.runInNewContext(source,ctx);
(async()=>{
  await events.DOMContentLoaded();
  const api=window.PTCGPlayerBadges;
  await api.refreshAttention();
  assert.match(api.html('tw12345678'),/原本備註/);
  assert.doesNotMatch(api.html('tw12345678',{attentionOverride:true}),/原本備註/);
  const input={value:'留意多龍'};
  const button={disabled:false},status={textContent:''};
  const form={dataset:{attentionNoteForm:'tw12345678'},querySelector(s){return s.includes('input')?input:s.includes('button')?button:status;}};
  const submit=()=>events.submit({target:{closest:()=>form},preventDefault(){}});
  await submit();
  assert.equal(writeCount,1);assert.equal(rows.owner.tw12345678,'留意多龍');
  assert.match(api.html('tw12345678'),/留意多龍/);
  input.value='一二三四五六七八九十超';
  await submit();assert.equal(writeCount,1);assert.match(status.textContent,/10/);
  input.value='<b>';await submit();assert.match(api.html('tw12345678'),/&lt;b&gt;/);
  ctx.identitySession={user:{id:'other'}};
  assert.doesNotMatch(api.html('tw12345678'),/&lt;b&gt;/);
  await api.refreshAttention();assert.match(api.html('tw12345678'),/其他帳號/);
  ctx.identitySession=null;await api.refreshAttention();
  assert.doesNotMatch(api.html('tw12345678'),/其他帳號/);
  console.log('PASS: private attention notes, length validation, escaped display, account isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
