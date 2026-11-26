'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('supabase/functions/ptcg-pairing-archive/index.ts');
const auth=src.slice(src.indexOf('async function requireMember('),src.indexOf('async function requireCron('));
let handler,role='guest',writes=0;
const ctx=vm.createContext({Request,Response,console,Deno:{serve:fn=>handler=fn},
 db:{auth:{getUser:async(token)=>({data:{user:token==='token'?{id:'user'}:null}})},rpc:async(name)=>({data:name==='is_pairing_member'?role!=='none':role==='admin',error:null})},
 json:(data,status=200)=>new Response(JSON.stringify(data),{status}),cors:{},
 listArchives:async()=>[{tid:'123',title:'test',last_error:'private'}],
 readArchive:async()=>({event:{tid:'123',last_error:'private'},knockout:{podium:{bracket:{audit:[1],updated_by:'private',conflict:{reported_by:'private',id:'1'}}}},context:{real_names:{tw1:'test'}}}),
 liveKnockout:async(_body,_uid,readonly)=>{assert.equal(readonly,true);return {ok:true,archive:{event:{tid:'123'}}};},
 saveKnockout:async()=>{writes++;return {ok:true}},saveKnockoutBracket:async()=>{writes++;return {ok:true}},
 sourceTid:()=> '123',insertArchive:async()=>{writes++;},requireCron:async()=>{throw Error('排程授權失敗');}});
vm.runInContext(stripTypeScriptTypes(auth+src.slice(src.indexOf('Deno.serve(')),{mode:'transform'}),ctx);
async function request(action,token='token'){const res=await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,tid:'123'})}));return {status:res.status,data:await res.json()};}
(async()=>{
 for(const a of ['list','get','top8-history'])assert.equal((await request(a)).status,200);
 const got=(await request('get')).data.archive;
 assert.equal(got.event.last_error,undefined);assert.equal(got.knockout.podium.bracket.audit,undefined);assert.equal(got.knockout.podium.bracket.conflict.reported_by,undefined);
 for(const a of ['register','configure-rounds','link','save-knockout'])assert.equal((await request(a)).status,403);
 assert.equal(writes,0);
 role='none';for(const a of ['list','get','top8-history'])assert.equal((await request(a)).status,403);
 role='admin';assert.equal((await request('get')).data.archive.knockout.podium.bracket.audit.length,1);
 assert.equal((await request('save-knockout')).status,200);assert.equal(writes,1);
 assert.equal((await request('get','')).status,403);
 assert.match(src,/if\(!readOnly\)await memberEvent/);
 assert.match(src,/if\(!readOnly&&watch\.data\?\.tid===tid/);
 const ui=read('history-knockout.js'),archive=read('pairing-match-archive.js');
 assert.match(ui,/const canEdit=\(\)=>pairingAuthorized&&\(isLive\(\)\|\|isAdmin\(\)\)/);
 assert.match(ui,/if\(!canEdit\(\)\|\|bracketBusy/);
 assert.match(ui,/action:isLive\(\)\?'top8-live':'top8-history'/);
 assert.match(archive,/pairingAccessRole!=="admin"/);
 assert.match(read('history.html'),/data-history-admin-only hidden/);
 console.log('PASS: member history reads, admin-only mutations, sanitized guest payloads, denied unapproved accounts, read-only historical TOP8');
})().catch(e=>{console.error(e);process.exitCode=1});
