import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@5.9.6";
import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import {ORIGIN,validEvent,validCode,parseEvent,parseRecipe} from "./source.ts";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=db.storage.from("official-deck-images");
const now=()=>new Date().toISOString();
const later=(minutes:number)=>new Date(Date.now()+minutes*60000).toISOString();
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function check(r:any){if(r.error)throw Error(r.error.message||String(r.error));return r.data;}
async function get(url:string){const r=await fetch(url,{redirect:"error",headers:{"User-Agent":"Mozilla/5.0 PTCG official public deck archive","Accept-Language":"zh-TW"},signal:AbortSignal.timeout(16000)});if(!r.ok)throw Error("source HTTP "+r.status);return r;}
async function git(file:string,revision="main"){return await (await get("https://raw.githubusercontent.com/guoer11/ptcg-ranking/"+revision+"/data/"+file)).json();}
const cutoff=()=>new Date(Date.now()+8*3600000-7*86400000).toISOString().slice(0,10);
const githubKeys=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
async function githubAuthorized(req:Request){try{const token=req.headers.get("x-github-oidc")||"";if(!token||token.length>12000)return false;const {payload:p}=await jwtVerify(token,githubKeys,{issuer:"https://token.actions.githubusercontent.com",audience:"ptcg-official-deck-sync",algorithms:["RS256"]});return p.repository_id==="1360869476"&&p.repository==="guoer11/ptcg-ranking"&&p.ref==="refs/heads/main"&&p.workflow_ref==="guoer11/ptcg-ranking/.github/workflows/update-tournaments.yml@refs/heads/main"&&["push","schedule","workflow_dispatch"].includes(String(p.event_name));}catch{return false;}}
async function sync(revision="main"){
 const [t,m]=await Promise.all([git("tournaments.json",revision),git("preliminary_sources.json",revision)]);
 const events=(t.events||[]).filter((e:any)=>validEvent(String(e.event_id))&&/^\d{4}-\d{2}-\d{2}$/.test(e.date||"")&&e.date<=today()&&["Great","Ultra","Premier","Master"].includes(e.league));
 const known=new Set(events.map((e:any)=>String(e.event_id)));
 // Existing official event identity is preserved; no unverified date/title matching.
 for(let i=0;i<events.length;i+=100)check(await db.from("official_deck_events").upsert(events.slice(i,i+100).map((e:any)=>({event_id:String(e.event_id),event_date:e.date,title:String(e.title||"").slice(0,200),league:e.league,division:String(e.group||"")})),{onConflict:"event_id",ignoreDuplicates:true}));
 const firstIds=events.filter((e:any)=>Array.isArray(e.results)&&e.results.length>0).map((e:any)=>String(e.event_id));
 let firstResults=0;
 for(let i=0;i<firstIds.length;i+=100){const newly=check(await db.from("official_deck_events").update({first_results_at:now(),result_check_pending:true,next_check_at:now()}).in("event_id",firstIds.slice(i,i+100)).is("first_results_at",null).select("event_id"));firstResults+=newly.length;}
 const map=(m.sources||[]).filter((s:any)=>validEvent(String(s.tid))&&known.has(String(s.event_id)));
 for(let i=0;i<map.length;i+=100)check(await db.from("official_deck_event_map").upsert(map.slice(i,i+100).map((s:any)=>({tid:String(s.tid),event_id:String(s.event_id)})),{onConflict:"tid",ignoreDuplicates:true}));
 // Additional archives: verify exact date, league, division and player-ID overlap.
 const registered=check(await db.from("official_deck_event_map").select("tid"));
 const mapped=new Set(registered.map((r:any)=>r.tid));
 const archives=check(await db.from("ptcg_match_archives").select("tid,title").not("final_seen_at","is",null).limit(200));
 let autoMapped=0;
 for(const archive of archives){
  if(mapped.has(archive.tid))continue;
  const title=String(archive.title||""),d=title.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  const league=/\bUBL\b|高級球/i.test(title)?"Ultra":/\bMBL\b|大師球/i.test(title)?"Master":/\bPBL\b|紀念球/i.test(title)?"Premier":/\bGBL\b|超級球/i.test(title)?"Great":"";
  const division=/孩童組|Junior/i.test(title)?"Junior":/少年組|Senior/i.test(title)?"Senior":/大師組|Masters?/i.test(title)?"Master":/全年齡組|Open/i.test(title)?"Open":"";
  if(!d||!league||!division)continue;
  const date=d[1]+"-"+d[2].padStart(2,"0")+"-"+d[3].padStart(2,"0");
  const candidates=events.filter((e:any)=>e.date===date&&e.league===league&&e.group===division);
  if(!candidates.length)continue;
  const final=check(await db.from("ptcg_match_archive_finals").select("standings").eq("tid",archive.tid).maybeSingle());
  const ids=new Set((final?.standings||[]).map((x:any)=>String(x.id||"").toLowerCase()).filter((id:string)=>/^tw\d+$/.test(id)));
  const matches=candidates.map((e:any)=>{
   const official=[...new Set<string>((e.results||[]).map((x:any)=>String(x.player_id||"").toLowerCase()).filter((id:string)=>/^tw\d+$/.test(id)))];
   const overlap=official.filter(id=>ids.has(id)).length;
   return {event_id:String(e.event_id),count:official.length,overlap};
  }).filter((x:any)=>x.overlap>=8&&x.overlap>=0.9*x.count);
  if(matches.length!==1)continue;
  check(await db.from("official_deck_event_map").upsert({tid:archive.tid,event_id:matches[0].event_id},{onConflict:"tid",ignoreDuplicates:true}));
  autoMapped++;
 }
 return {events:events.length,mappings:map.length,autoMapped,firstResults};
}
async function discover(event:any){
 const claim=check(await db.from("official_deck_events").update({next_check_at:later(20)}).eq("event_id",event.event_id).eq("next_check_at",event.next_check_at).select("event_id,next_check_at"));
 if(!claim.length)return {event:event.event_id,skipped:true};
 try{
  const html=await (await get(ORIGIN+"/tw/event-search/"+event.event_id+"/")).text();
  const rows=parseEvent(html);
  const codes=[...new Set(rows.map(r=>r.code))];
  if(codes.length)check(await db.from("official_deck_recipes").upsert(codes.map(code=>({code})),{onConflict:"code",ignoreDuplicates:true}));
  if(rows.length)check(await db.from("official_deck_entries").upsert(rows.map(r=>({...r,event_id:event.event_id})),{onConflict:"event_id,player_id",ignoreDuplicates:true}));
  // A first-result signal received during this fetch must not be cleared by an earlier claim.
  check(await db.from("official_deck_events").update({checked_at:now(),next_check_at:later(60),result_check_pending:false}).eq("event_id",event.event_id).eq("next_check_at",claim[0].next_check_at));
  return {event:event.event_id,links:rows.length};
 }catch(e){console.warn("official deck discovery",event.event_id,String(e));return {event:event.event_id,error:String(e)};}
}
async function capture(row:any){
 if(!validCode(row.code))return {error:"invalid code"};
 const attempts=row.attempts+1;
 const claim=check(await db.from("official_deck_recipes").update({next_attempt_at:later(Math.min(1440,15*2**Math.min(attempts-1,6))),attempts}).eq("code",row.code).eq("next_attempt_at",row.next_attempt_at).is("captured_at",null).select("code"));
 if(!claim.length)return {skipped:true};
 try{
  const cards=Array.isArray(row.cards)?row.cards:parseRecipe(await (await get(ORIGIN+"/tw/deck-build/recipe/"+row.code+"/")).text());
  if(cards.reduce((sum,c)=>sum+c.count,0)!==60)throw Error("not 60 cards");
  check(await db.from("official_deck_recipes").update({cards,captured_at:now()}).eq("code",row.code).is("captured_at",null));
  return {saved:true,code:row.code,cards:60};
 }catch(e){console.warn("official deck capture",row.code,String(e));return {code:row.code,error:String(e)};}
}
function officialImage(code:string){return ORIGIN+"/tw/deck-img/"+code+".png";}
async function cleanup(){
 const rows=check(await db.rpc("official_deck_image_jobs",{p_mode:"cleanup",p_limit:40}))||[];
 const results=[];
 for(let i=0;i<rows.length;i+=5){
  results.push(...await Promise.all(rows.slice(i,i+5).map(async (row:any)=>{
   if(!validCode(row.code))return {skipped:true};
   try{
    const paths:string[]=[];
    // Recent recipes must retain a JPG and have a working official original before PNG deletion.
    if(row.image_path===row.code+".png"){
     if(!row.active)paths.push(row.image_path);
     else if(row.preview_path===row.code+".jpg"){
      const jpg=await bucket.download(row.preview_path);
      if(jpg.error||!jpg.data||!jpg.data.size)throw Error("preview missing");
      const r=await fetch(officialImage(row.code),{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(8000)});
      if(r.ok&&(r.headers.get("content-type")||"").toLowerCase().startsWith("image/png"))paths.push(row.image_path);
      else throw Error("official original not verified");
     }
    }
    if(!row.active&&row.preview_path===row.code+".jpg")paths.push(row.preview_path);
    if(!paths.length)return {code:row.code,skipped:true};
    check(await bucket.remove(paths));
    const patch:Record<string,null>={};
    if(paths.includes(row.image_path))patch.image_path=null;
    if(paths.includes(row.preview_path))patch.preview_path=null;
    let q=db.from("official_deck_recipes").update(patch).eq("code",row.code);
    if(patch.image_path===null)q=q.eq("image_path",row.image_path);
    if(patch.preview_path===null)q=q.eq("preview_path",row.preview_path);
    check(await q);
    return {code:row.code,removed:paths};
   }catch(e){console.warn("official image cleanup",row.code,String(e));return {code:row.code,error:String(e)};}
  })));
 }
 return results;
}
async function discoverDue(eventId="",firstOnly=false){
 let q=db.from("official_deck_events").select("event_id,event_date,next_check_at").lte("next_check_at",now()).not("first_results_at","is",null).or("result_check_pending.eq.true,event_date.gte."+cutoff()).lte("event_date",today());
 if(eventId)q=q.eq("event_id",eventId);
 if(firstOnly)q=q.eq("result_check_pending",true);
 const events=check(await q.order("result_check_pending",{ascending:false}).order("next_check_at").order("event_date",{ascending:false}).limit(2));
 const discovery=[];
 for(const event of events)discovery.push(await discover(event));
 return discovery;
}
async function poll(eventId:string,recipeCode:string,firstOnly=false){
 const discovery=await discoverDue(eventId,firstOnly);
 const batchSize=firstOnly?3:8;
 const newEvents=discovery.filter((x:any)=>x.links>0).map((x:any)=>x.event);
 if(firstOnly&&!newEvents.length)return {discovery,captures:[]};
 const due=()=>db.from("official_deck_recipes").select("code,attempts,next_attempt_at,cards").is("captured_at",null).lte("next_attempt_at",now());
 let recipes:any[]=[];
 if(recipeCode)recipes=check(await due().eq("code",recipeCode).limit(1));
 else{
  if(newEvents.length){
   const linked=check(await db.from("official_deck_entries").select("code").in("event_id",newEvents).limit(500));
   const codes=[...new Set(linked.map((x:any)=>x.code))];
   if(codes.length)recipes=check(await due().in("code",codes).order("next_attempt_at").limit(batchSize));
  }
  if(!firstOnly&&recipes.length<batchSize){
  const mapped=check(await db.from("official_deck_event_map").select("event_id").limit(200));
  const eventIds=[...new Set(mapped.map((x:any)=>x.event_id))];
  if(eventIds.length){
   const linked=check(await db.from("official_deck_entries").select("code").in("event_id",eventIds).limit(200));
   const codes=[...new Set(linked.map((x:any)=>x.code))];
   if(codes.length){const more=check(await due().in("code",codes).order("next_attempt_at").limit(batchSize));const seen=new Set(recipes.map(x=>x.code));recipes.push(...more.filter((x:any)=>!seen.has(x.code)).slice(0,batchSize-recipes.length));}
  }
  if(recipes.length<batchSize){const more=check(await due().order("next_attempt_at").limit(16));const seen=new Set(recipes.map(x=>x.code));recipes.push(...more.filter((x:any)=>!seen.has(x.code)).slice(0,batchSize-recipes.length));}
  }
 }
 const captures=[];
 for(let i=0;i<recipes.length;i+=3)captures.push(...await Promise.all(recipes.slice(i,i+3).map(row=>capture(row))));
 return {discovery,captures};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({ok:false},405);
 try{
  if(req.headers.has("x-github-oidc")){
   if(!await githubAuthorized(req))return json({ok:false,error:"unauthorized"},403);
   const body=await req.json();
   if(body.action!=="results-sync"||! /^[a-f0-9]{40}$/.test(String(body.revision||"")))return json({ok:false,error:"invalid request"},400);
   const synced=await sync(body.revision);
   return json({ok:true,...synced,...await poll("","",true)});
  }
  const config=check(await db.rpc("get_ptcg_github_trigger_config_for_service"));
  const secret=String(config?.cron_secret||"");
  if(!secret||req.headers.get("x-ptcg-cron-secret")!==secret)return json({ok:false,error:"unauthorized"},403);
  const body=await req.json();
  if(body.action==="sync"){const synced=await sync();return json({ok:true,...synced,...await poll("","",true)});}
  if(body.action==="cleanup")return json({ok:true,cleanup:await cleanup()});
  if(body.action!=="poll")return json({ok:false,error:"invalid action"},400);
  const eventId=String(body.event_id||""),code=String(body.code||"");
  if(eventId&&!validEvent(eventId)||code&&!validCode(code))return json({ok:false,error:"invalid identifier"},400);
  return json({ok:true,...await poll(eventId,code)});
 }catch(e){console.error("official deck archive",String(e));return json({ok:false,error:String(e)},500);}
});
