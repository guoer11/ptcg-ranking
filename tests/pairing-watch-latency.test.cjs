'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/ptcg-pairing-watch/index.ts','utf8').replace(/^import .*;\s*$/gm,'');
const ids=['tw39371632','tw69121729'];
const A=ids[0],B=ids[1];
const attempts=[],cleanups=[],keys=[],logs=[];
const rows=['slow','fast','dead','ambiguous','other-player'].map(endpoint=>({endpoint,p256dh:'fixture',auth:'fixture'}));
const families=[{endpoint:'slow',active:true,player_filter_mode:'custom',allowed_player_ids:[A]},{endpoint:'other-player',active:true,player_filter_mode:'custom',allowed_player_ids:[B]}];
const service={from(table){let op='select';const q={select(){return q},eq(){return q},delete(){op='delete';return q},update(){op='update';return q},then(resolve){if(op!=='select')cleanups.push([table,op]);return Promise.resolve({data:table==='push_subscriptions'?rows:families,error:null}).then(resolve)}};return q;},rpc(){return Promise.resolve({data:{public_key:'fixture',private_key:'fixture',subject:'fixture'}})}};
let lineAttempts=0;
const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Request,Response,AbortSignal,atob,btoa,crypto:require('node:crypto').webcrypto,
 console:{log:s=>logs.push(s),warn(){},error(){}},setTimeout:(fn)=>setImmediate(fn),
 fetch:async(url,options)=>{assert.match(url,/api\.line\.me/);keys.push(options.headers['X-Line-Retry-Key']);lineAttempts++;return lineAttempts===1?new Response('',{status:500}):new Response('',{status:409,headers:{'x-line-accepted-request-id':'accepted'}})},
 Deno:{env:{get:k=>k.startsWith('LINE_')?'fixture':''},serve(){}},createClient:()=>service,
 sendNotification:async(sub)=>{attempts.push(sub.endpoint);if(sub.endpoint==='slow'&&attempts.filter(x=>x==='slow').length===1)throw Object.assign(Error('busy'),{statusCode:503});if(sub.endpoint==='dead')throw Object.assign(Error('gone'),{statusCode:410});if(sub.endpoint==='ambiguous')throw Error('connection reset');},
 A,B,ids,fixture:{id:1,user_id:'owner',source_url:'https://tcg.sfc-jpn.jp/tourround.asp?tid=123&kno=2&znt=0',next_round:3,active:true,updated_at:'initial',player_id:A}});
vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'}),ctx);
const run=s=>vm.runInContext(s,ctx);
(async()=>{
 const line=await run("sendLine('fixture','body')");
 assert.equal(line.sent,true);assert.equal(lineAttempts,2);assert.equal(keys[0],keys[1]);assert.match(keys[0],/^[a-f0-9-]{36}$/i);
 const push=await run("sendWebPush('owner','title','body','/family',ids=>ids.includes(A)?{title:'title',body:'only A',url:'/family',tag:'ptcg-family-pairing'}:null)");
 assert.equal(push.sent,2);assert.equal(push.failed,2);
 assert.equal(attempts.filter(x=>x==='slow').length,2);assert.equal(attempts.filter(x=>x==='fast').length,1);
 assert(attempts.indexOf('fast')<attempts.lastIndexOf('slow'),'fast device not blocked by failed slow device');
 assert.equal(attempts.filter(x=>x==='dead').length,1);assert.equal(attempts.filter(x=>x==='ambiguous').length,1);assert(!attempts.includes('other-player'));
 assert.equal(cleanups.length,2);
 run("globalThis.started=[];readCurrentRank=async()=>{started.push('rank');return new Promise(()=>{})};fetchPairing=async()=>{started.push('round');return {available:true,tid:'123',round:3,match:{player:A,opponent:B,table:'10'}}}");
 const early=await run("parallelWatchLookup(fixture,A)");
 assert.equal(early.batch.match.table,'10');assert.equal(early.rank.results.length,0);assert.deepEqual(Array.from(ctx.started),['rank','round']);
 run("readCurrentRank=async()=>{throw Error('rank unavailable')};fetchPairing=async()=>({available:true,match:{player:A,opponent:B,table:'10'}})");
 const independent=await run("parallelWatchLookup(fixture,A)");assert.equal(independent.batch.match.table,'10');
 run("readCurrentRank=async()=>({available:true,is_final:true,standing_match:{player:A,rank:1}});fetchPairing=async()=>{throw Error('round unavailable')}");
 const final=await run("parallelWatchLookup(fixture,A)");assert.equal(final.rank.is_final,true);
 run("readCurrentRank=async()=>({available:false});fetchPairing=async()=>({available:true,tid:'123',round:3,match:{player:A,opponent:B,table:'10'}});resolveName=async()=> 'name';resolveDeckKnowledge=async()=>({confirmed:'deck',possible:[]});globalThis.claims=0;globalThis.notices=0;claimMulti=async()=>++claims===1;notifyMatch=async()=>{notices++;return {line:{sent:true},push:{sent:1}}}");
 await run("Promise.all([pollOne(fixture),pollOne(fixture)])");assert.equal(ctx.notices,1);
 assert(logs.some(x=>x.includes('"stage":"delivery-retry"')));assert(logs.some(x=>x.includes('"rank_deferred":true')));assert(logs.some(x=>x.includes('"stage":"notice-finished"')));
 console.log('PASS: independent parallel lookup, rank failure isolation, deferred slow ranking, parallel per-device delivery, bounded retry, LINE idempotency, overlap protection, timing logs');
})().catch(e=>{console.error(e);process.exitCode=1});
