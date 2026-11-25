'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
function edge(path,extras={}){
 let handler;
 const context=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Request,Response,AbortSignal,atob,btoa,console,fetch:async()=>{throw Error('unexpected real network request')},Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},createClient:()=>({}),sendNotification:()=>{throw Error('unexpected real push')},...extras});
 const source=read(path).replace(/^import .*;\s*$/gm,'');
 vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'}),context,{filename:path});
 return {context,handler,run:(s)=>vm.runInContext(s,context)};
}
const ids=['tw10000001','tw10000002'],url='https://tcg.sfc-jpn.jp/tourround.asp?tid=12345&kno=3&znt=0';
const request=(body)=>new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
async function main(){
 const parser=edge('supabase/functions/ptcg-pairing/index.ts');
 parser.run("globalThis.fetches=0; fetchHtml=async()=>{fetches++;return {pageText:'Round 3',title:'Round 3',rows:[]}}; parsePairings=()=>[{table:'601',player:'tw10000001',opponent:'tw20000001',player_score:'6'},{table:'615',player:'tw10000002',opponent:'tw20000002',player_score:'3'}]");
 let response=await parser.handler(request({url,players:ids}));
 let data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.results.length,2);
 assert.equal(data.results[0].match.table,'601');assert.equal(data.results[1].match.table,'615');assert.equal(parser.run('fetches'),1);
 response=await parser.handler(request({url,players:[ids[0],ids[0]]}));assert.equal(response.status,400);
 response=await parser.handler(request({url,player:ids[0]}));data=await response.json();assert.equal(data.match.table,'601');assert(!data.results);
 const watch=edge('supabase/functions/ptcg-pairing-watch/index.ts');
 const w=watch.context;w.ids=ids;w.source=url;
 watch.run("resolveName=async id=>id==='tw10000001'?'玩家甲':id==='tw10000002'?'玩家乙':''; resolveDeckKnowledge=async()=>({confirmed:'測試牌組',possible:[]}); previousDeckFor=async()=>''; globalThis.notices=[]; globalThis.live={id:1,user_id:'test',tid:'12345',source_url:source,player_id:ids[0],player_ids:ids,next_round:3,updated_at:'initial',active:true,multi_state:{}}; globalThis.rankRows=[]; globalThis.mode='both'; globalThis.rev=0; readCurrentRank=async()=>({available:rankRows.length>0,is_final:rankRows.length>0,tid:'12345',results:ids.map(id=>({player_id:id,standing_match:rankRows.find(r=>r.player===id)}))}); fetchPairing=async(u)=>({available:mode!=='none',tid:'12345',round:Number(new URL(u).searchParams.get('kno')),results:ids.map((id,i)=>({player_id:id,match:mode==='none'||(mode==='partial'&&i===1)?null:{player:id,opponent:'tw2000000'+(i+1),table:String(601+i*14),ttl_score:String(6-i*3)}}))}); claimMulti=async(w,patch)=>{if(w.updated_at!==live.updated_at||!live.active)return false;live={...live,...patch,updated_at:String(++rev)};return true}; notifyMulti=async(user,batch,cards,type)=>{notices.push({type,cards,msg:buildMultiNotice(batch,cards,type)});return {line:{sent:true},push:{sent:1}}};");
 await watch.run('Promise.all([pollMulti({...live}),pollMulti({...live})])');
 assert.equal(w.notices.length,1,'overlapping workers must not duplicate notice');assert.equal(w.live.next_round,4);
 const message=w.notices[0].msg;
 assert.match(message.lineBody,/玩家甲[\s\S]*601[\s\S]*玩家乙[\s\S]*615/);
 const familyUrl=new URL(message.familyUrl,'https://guoer11.github.io');
 assert.equal(familyUrl.pathname,'/ptcg-ranking/family-notify.html');
 const cards=JSON.parse(Buffer.from(familyUrl.searchParams.get('players'),'base64url').toString('utf8'));
 assert.equal(cards.length,2);assert.equal(cards[1].ttl_score,'3');
 assert.equal(cards[0].deck,'測試牌組');
 // A final for one player must not stop monitoring the other.
 watch.run("rankRows=[{player:ids[0],rank:2}]");
 await watch.run('pollMulti({...live})');
 assert.equal(w.notices.length,2);assert.equal(w.notices[1].type,'final');assert.equal(w.live.active,true);
 assert.equal(w.notices[1].cards[0].rank,'2');assert.equal(w.notices[1].cards[1].waiting,true);
 watch.run("rankRows=[{player:ids[0],rank:2},{player:ids[1],rank:7}]");
 await watch.run('pollMulti({...live})');
 assert.equal(w.notices.length,3);assert.equal(w.live.active,false);assert.equal(w.live.final_notified,true);
 assert.equal(w.notices[2].cards[1].rank,'7');
 // One missing player is not falsely assigned a table. Supplement only on new data.
 watch.run("live={...live,active:true,updated_at:'reset',next_round:3,multi_state:{},final_notified:false};notices=[];rankRows=[];mode='partial'");
 await watch.run('pollMulti({...live})');assert.equal(w.notices.length,1);assert.equal(w.notices[0].cards[1].waiting,true);assert.equal(w.live.next_round,4);
 watch.run("mode='none';const mockFetch=fetchPairing;fetchPairing=async(u,players)=>{if(Number(new URL(u).searchParams.get('kno'))===3){mode='both';const r=await mockFetch(u,players);mode='none';return r;}return mockFetch(u,players);}");
 await watch.run('pollMulti({...live})');assert.equal(w.notices.length,2);assert.equal(w.notices[1].cards[1].table,'615');
 await watch.run('pollMulti({...live})');assert.equal(w.notices.length,2);
 // Family renderer handles exactly the combined payload, escaping text and preserving single-player format.
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,innerHTML:'',textContent:''});return nodes.get(id);};
 const store=new Map();const ctx=vm.createContext({document:{addEventListener(){},getElementById:el},window:{location:{search:familyUrl.search}},URLSearchParams,TextDecoder,Uint8Array,atob,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},console});
 vm.runInContext(read('family-notify.js'),ctx);
 assert.equal(vm.runInContext('familyRenderMatchSummary()',ctx),true);
 assert.match(el('familyMatchGrid').innerHTML,/玩家甲[\s\S]*601[\s\S]*玩家乙[\s\S]*615/);
 assert.equal((el('familyMatchGrid').innerHTML.match(/family-multi-player/g)||[]).length,2);
 ctx.window.location.search='?type=round&round=3&player=tw10000001&table=601&opponent=tw20000001';
 assert.equal(vm.runInContext('familyRenderMatchSummary()',ctx),true);assert.match(el('familyMatchGrid').innerHTML,/family-table-card/);
 assert.doesNotMatch(el('familyMatchGrid').innerHTML,/family-multi-player/);
 assert.match(read('pairing.html'),/id="pairingAddPlayer"/);assert.match(read('pairing.js'),/start-multi/);
 console.log('PASS: shared official page, distinct player results, one notification per round, partial/final progress, family cards, single-player compatibility');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
