'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const auth=read('auth-ui.js'),tournament=read('tournaments.js');
const extract=(src,a,b)=>src.slice(src.indexOf(a),src.indexOf(b));
let role='guest',queries=0,rendered=0,visible=[];
const client={rpc:async()=>({data:role,error:null}),from(table){assert.equal(table,'player_identities');queries++;return {select(){return this},order(){return this},range:async()=>({data:[{player_id:'tw00000001',real_name:'測試姓名'}],error:null})}},auth:{getSession:async()=>({data:{session:role==='signed-out'?null:{user:{id:'test'}}}})}};
const nav=['pairing.html','history.html'].map(href=>({hidden:true,getAttribute:()=>href}));
const elements={};
const document={querySelectorAll:()=>nav,dispatchEvent(){},getElementById:id=>elements[id]||(elements[id]={textContent:'',placeholder:''})};
const context=vm.createContext({identityAuthorized:false,identityAccessRole:'none',identitySession:{user:{id:'test'}},identityClient:client,pairingNavRequestId:0,identityLoadRequestId:0,identityData:{},document,searchInput:{},console,CustomEvent:class{},renderRanking(){rendered++},updateIdentityAuthUI(){}});
vm.runInContext(extract(auth,'function currentIdentityUserId()','hidePairingNav();\n\nfunction clearPrivateIdentities')+'\n'+extract(auth,'function clearPrivateIdentities()','function identityAuthButton()')+'\n'+extract(auth,'function updateIdentityTextUI()','function refreshPushAuthUI()')+'\n'+extract(auth,'async function loadPrivateIdentities()','async function handleAccountAuthAction()'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
 for(const r of ['guest','admin','none']){
  role=r;const before=queries;await run('loadPrivateIdentities()');run('updateIdentityTextUI()');
  assert.equal(queries-before,r==='none'?0:1);
  assert.equal(run("identityData.players.tw00000001?.real_name"),r==='none'?undefined:'測試姓名');
  assert.equal(nav[0].hidden,r==='none');assert.equal(nav[1].hidden,r!=='admin');
  assert.equal(run("searchInput.placeholder.includes('真實姓名')"),r!=='none');
 }
 const t=vm.createContext({tournamentIdentityMap:{},tournamentIdentityGeneration:0,tournamentPairingClient:client,tournamentModal:{classList:{contains:()=>true},dataset:{eventId:'1'}},window:{supabase:{createClient(){return client}}},ensureTournamentSupabase:async()=>{},removeTournamentPairingNav(){},insertTournamentPairingNav(){},openTournamentModal(){rendered++},console});
 vm.runInContext(extract(tournament,'function clearTournamentPrivateIdentities()','function clearTournamentPrivateIdentities()')||'function clearTournamentPrivateIdentities(){tournamentIdentityMap={};}',t);
 // Use the actual clear helper, not a mock.
 vm.runInContext(tournament.match(/function clearTournamentPrivateIdentities\(\)\{[\s\S]*?\n\}/)[0]+'\n'+extract(tournament,'async function refreshTournamentPairingNav()','function tournamentFormatUpdate('),t);
 for(const r of ['guest','admin','none','signed-out']){
  role=r;const before=queries;await vm.runInContext('refreshTournamentPairingNav()',t);
  assert.equal(queries-before,['guest','admin'].includes(r)?1:0);
  assert.equal(vm.runInContext("tournamentRealName('tw00000001')",t),['guest','admin'].includes(r)?'測試姓名':'');
 }
 assert.match(read('history-center.js'),/rpc\('can_use_pairing'\)/);
 assert.match(read('index.html'),/auth-ui\.js\?v=3\.0\.0-name-r1/);
 assert.match(read('tournaments.html'),/tournaments\.js\?v=3\.0\.0-name-r1/);
 console.log('PASS: authorized guest real names on ranking and tournament pages; unauthorized/sign-out cleared; history admin-only');
})().catch(e=>{console.error(e);process.exitCode=1});
