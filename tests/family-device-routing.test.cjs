'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
const ids=['tw39371632','tw69121729'],A=ids[0],B=ids[1];
const rows=['owner','old','familyA','familyB','inactive'].map(endpoint=>({endpoint,p256dh:'fixture',auth:'fixture'}));
const families=[
 {endpoint:'old',active:true,player_filter_mode:'all',allowed_player_ids:[]},
 {endpoint:'familyA',active:true,player_filter_mode:'custom',allowed_player_ids:[A]},
 {endpoint:'familyB',active:true,player_filter_mode:'custom',allowed_player_ids:[B]},
 {endpoint:'inactive',active:false,player_filter_mode:'all',allowed_player_ids:[]}
];
const sends=[],lines=[];
const service={from(table){const q={select(){return q},eq(){return q},then(resolve){return Promise.resolve({data:table==='push_subscriptions'?rows:families,error:null}).then(resolve)}};return q;},rpc(){return Promise.resolve({data:{public_key:'fixture',private_key:'fixture',subject:'fixture'}})}};
function edge(path){let handler;const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Request,Response,AbortSignal,atob,btoa,console,fetch:async()=>{throw Error('no network')},Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},createClient:()=>service,sendNotification:async(sub,payload)=>sends.push({endpoint:sub.endpoint,payload:JSON.parse(payload)}),ids,A,B,lines});
 vm.runInContext(stripTypeScriptTypes(read(path).replace(/^import .*;\s*$/gm,''),{mode:'transform'}),ctx,{filename:path});
 return {ctx,handler,run:s=>vm.runInContext(s,ctx)};
}
async function main(){
 const watch=edge('supabase/functions/ptcg-pairing-watch/index.ts');
 watch.run("sendLine=async(title,body)=>{lines.push({title,body});return {sent:true}}; globalThis.batch={tid:'123',round:3};globalThis.cards=[{player_id:A,player:'甲 ('+A+')',table:'12',opponent:'對手甲 (tw11111111)',deck:'甲牌組',ttl_score:'6'},{player_id:B,player:'乙 ('+B+')',table:'25',opponent:'對手乙 (tw22222222)',deck:'乙牌組',ttl_score:'3'}];");
 await watch.run("notifyMulti('owner',batch,cards,'round')");
 assert.equal(lines.length,1);assert.match(lines[0].body,new RegExp(A+'[\\s\\S]*'+B));
 assert.deepEqual(sends.map(s=>s.endpoint),['owner','old','familyA','familyB']);
 const target=id=>sends.find(s=>s.endpoint===id).payload;
 assert.equal(target('owner').tag,'ptcg-pairing');
 assert.match(target('owner').body,new RegExp(B));
 const old=new URL(target('old').url,'https://example.test');
 assert.equal(JSON.parse(Buffer.from(old.searchParams.get('players'),'base64url')).length,2);
 for(const [key,yes,no] of [['familyA',A,B],['familyB',B,A]]){
  const p=target(key),u=new URL(p.url,'https://example.test');
  assert.match(p.body,new RegExp(yes));assert(!p.body.includes(no));assert(!p.url.includes(no));assert.equal(u.searchParams.get('player_id'),yes);assert.equal(u.searchParams.get('round'),'3');assert.equal(p.tag,'ptcg-family-pairing');
 }
 sends.length=0;lines.length=0;
 await watch.run("notifyMulti('owner',batch,[{player_id:A,player:A,rank:'2',final:true},{player_id:B,player:B,waiting:true}],'final')");
 assert.deepEqual(sends.map(s=>s.endpoint),['owner','old','familyA']);
 assert.equal(new URL(target('familyA').url,'https://example.test').searchParams.get('rank'),'2');
 sends.length=0;
 watch.run("resolveName=async()=>''; resolveDeckKnowledge=async()=>({confirmed:'',possible:[]})");
 await watch.run("notifyMatch('owner',{tid:'123',round:4,match:{player:B,opponent:'tw11111111',table:'9'}})");
 assert.deepEqual(sends.map(s=>s.endpoint),['owner','old','familyB']);
 sends.length=0;
 await watch.run("notifyFinalRank('owner',{tid:'123',standing_match:{player:A,rank:1}},true)");
 assert.deepEqual(sends.map(s=>s.endpoint),['owner','old','familyA']);
 const family=edge('supabase/functions/ptcg-family-push/index.ts');
 assert.equal(family.run('filterSettings({}).player_filter_mode'),'all');
 assert.equal(family.run("filterSettings({player_filter_mode:'custom',allowed_player_ids:[A,A]}).allowed_player_ids.length"),1);
 assert.throws(()=>family.run("filterSettings({player_filter_mode:'custom',allowed_player_ids:[]})"));
 assert.throws(()=>family.run("filterSettings({player_filter_mode:'custom',allowed_player_ids:['wrong']})"));
 const request=body=>new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await family.handler(request({action:'test-device',device_id:'all'}))).status,401);
 assert.equal((await family.handler(request({action:'update-device',device_id:1}))).status,401);
 assert.equal((await family.handler(request({action:'device-status',endpoint:'x',auth:'wrong'}))).status,403);
 const html=read('pairing.html');
 assert.match(html,/<details id="pairingAdvancedCollapse"[\s\S]*?id="familyDeviceTest"[\s\S]*?<\/details>/);
 console.log('PASS: legacy all mode, individual device routes, final/single/partial notices, owner-only management, test tool placement');
}
main().catch(e=>{console.error(e);process.exitCode=1});
