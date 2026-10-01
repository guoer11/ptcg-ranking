// Optional DOM integration test: jsdom 26.1.0 via NODE_PATH; all backend calls mocked.
const {JSDOM}=require('jsdom');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=require('../data/pairing-odds-3000442.json');
(async()=>{
 const html=fs.readFileSync(path.join(root,'pairing.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/pairing.html'}),w=dom.window,$=id=>w.document.getElementById(id),calls=[];
 w.pairingAuthorized=true;w.pairingSession={access_token:'mock',user:{id:'test'}};w.PAIRING_SUPABASE_KEY='mock';let stage='round5';
 $('pairingSourceUrl').value='https://tcg.sfc-jpn.jp/tour.asp?tid=3000442';
 w.fetch=async(url,request)=>{
  calls.push({url,body:request?.body?JSON.parse(request.body):null,headers:request?.headers});
  if(url.startsWith('data/'))return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.split('?')[0]),'utf8'))};
  assert(url.endsWith('ptcg-pairing-forecast'));assert.equal(request.headers.Authorization,'Bearer mock');
  const body=JSON.parse(request.body);
  if(stage==='ended'||body.action==='final')return {ok:true,json:async()=>({ok:true,type:'final',available:true,tid:'3000442',standing:{id:body.player_id,rank:15,score:15},source_url:'https://tcg.sfc-jpn.jp/tourround.asp?tid=3000442&kno=9999999&znt=1'})};
  const snapshot=fixture.snapshots[stage==='round6'?5:4];
  return {ok:true,json:async()=>({ok:true,type:'snapshot',tid:'3000442',title:'公開測試場',rounds:[1,2,3,4,5,6,7],checked_at:'2026-10-01T05:00:00Z',source_url:'https://tcg.sfc-jpn.jp/tourround.asp?tid=3000442&kno='+snapshot.round,snapshot})};
 };
 for(const p of ['pairing-odds-engine.js','pairing-odds.js'])w.eval(fs.readFileSync(path.join(root,p),'utf8'));
 await new Promise(r=>w.setTimeout(r,0));
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>w.setTimeout(r,20));}throw new Error('DOM condition timed out');};
 const run=async()=>{$('oddsRun').click();await wait(()=>!$('oddsRun').disabled);};
 const input=(id,value,event='input')=>{$(id).value=value;$(id).dispatchEvent(new w.Event(event,{bubbles:true}));};
 assert.equal($('oddsMode').value,'live');assert.equal(w.document.querySelector('main').lastElementChild.id,'pairingOdds');
 await run();assert($('oddsResult').textContent.includes('估算結果'));assert($('oddsResult').textContent.includes('預估玩家人數'));assert.equal(w.document.querySelector('.odds-record-table thead th:last-child').textContent,'進入前 8 名的機率');assert.equal(calls[0].body.round,'auto');
 const before=calls.length;w.document.querySelector('[data-odds-view="16"]').click();assert.equal(calls.length,before);assert(w.document.querySelector('.odds-record-table thead th:last-child').textContent.includes('16'));
 assert($('oddsResult').textContent.includes('目前無法達成'));assert.equal(w.document.querySelectorAll('.odds-record-table thead th').length,3);
 input('pairingPlayerId','tw00000000');assert(!$('oddsResult').textContent.includes('估算結果'));assert($('oddsActual').hidden);await run();assert($('oddsResult').textContent.includes('找不到'));
 input('pairingPlayerId','tw39371632');stage='round6';await run();assert(!$('oddsPending').hidden);assert($('oddsResult').textContent.includes('空白對手'));
 const pending=w.document.querySelector('[data-odds-pending]');pending.value='absent';pending.dispatchEvent(new w.Event('change'));await run();assert($('oddsResult').textContent.includes('本次估算留賽 110 人'));
 input('oddsMode','history','change');assert(!$('oddsHistoryFields').hidden);assert($('oddsLiveRoundField').hidden);assert(![...$('oddsHistoryRound').options].some(o=>o.disabled));await run();assert($('oddsResult').textContent.includes('估算結果'));
 const requestsBeforeFinal=calls.filter(c=>c.url.includes('-final.json')).length;assert.equal(requestsBeforeFinal,0);$('oddsReadActual').click();await wait(()=>$('oddsActualResult').textContent.includes('第 15 名'));
 input('oddsHistoryRound','1');await run();assert($('oddsResult').textContent.includes('空白對手'));assert(!$('oddsPending').hidden);
 input('oddsMode','live','change');stage='ended';await run();assert($('oddsResult').textContent.includes('官方最終結果'));assert.equal(w.document.querySelector('.odds-record-table tbody tr:nth-child(2) td:last-child').textContent,'已進入');
 input('oddsType','master','change');await run();assert($('oddsResult').textContent.includes('取幾名'));
 w.document.dispatchEvent(new w.CustomEvent('pairing:auth-ready',{detail:{allowed:false}}));assert($('oddsRun').disabled);assert($('oddsActual').hidden);
 dom.window.close();console.log('PASS: formal-mode shared URL/player, record table/cut switch, stale result reset, missing player, pending confirmation, historical rounds all enabled, no final leakage, official-result transition, custom cutoff and auth gate.');
})().catch(e=>{console.error(e);process.exit(1)});
