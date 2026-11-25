'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
const source=read('supabase/functions/ptcg-pairing-watch/index.ts');
let access='admin',line=0,push=0;
const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Request,Response,AbortSignal,atob,btoa,console,
 Deno:{env:{get:()=>''},serve(){}},createClient:()=>({rpc:async(name)=>({data:name==='is_pairing_member'?access!=='none':name==='is_pairing_authorized'?access==='admin':null,error:null})}),sendNotification:async()=>{},setTimeout});
vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;\s*$/gm,''),{mode:'transform'}),ctx);
ctx.recordLine=()=>{line++};ctx.recordPush=()=>{push++};
vm.runInContext("sendLine=async()=>{recordLine();return {sent:true}};sendWebPush=async()=>{recordPush();return {sent:1}}",ctx);
(async()=>{
  for(const mode of ['admin','guest','none']){
    access=mode;const before=[line,push];const result=await vm.runInContext("sendBoth('fixture','title','body')",ctx);
    assert.equal(line-before[0],mode==='admin'?1:0,'guest cannot send owner LINE');
    assert.equal(push-before[1],mode==='none'?0:1,'revoked account cannot send push');
  }
  assert.match(source,/x-ptcg-cron-secret/);
  const scout=read('pairing-deck-scout.js'),history=read('pairing-history.js');
  assert.match(scout,/from\('pairing_shared_scouts'\)/);
  assert.match(scout,/from\('pairing_shared_pairs'\)/);
  assert.match(scout,/postgres_changes/);
  assert.match(scout,/row\.conflict/);
  assert.match(history,/from\('pairing_shared_scouts'\)/);
  assert.match(read('history-center.js'),/rpc\('can_use_pairing'\)/);
  assert.match(read('supabase/functions/ptcg-pairing-archive/index.ts'),/const member=await requireMember\(req\)/);
  assert.match(read('supabase/functions/ptcg-line/index.ts'),/is_pairing_authorized/);
  assert.match(read('pairing-guest-admin.js'),/pairing_guest_grants/);
  assert.match(read('index.html'),/pairing-guest-admin\.js\?v=3\.0\.0/);
  console.log('PASS: guest LINE isolation, revoked delivery blocked, shared reads, Realtime and admin-only archive');
})().catch(e=>{console.error(e);process.exitCode=1});
