import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import {ORIGIN,validEvent,validCode,parseEvent,parseRecipe,isPng} from "./source.ts";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=db.storage.from("official-deck-images");
const now=()=>new Date().toISOString();
const later=(minutes:number)=>new Date(Date.now()+minutes*60000).toISOString();
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function check(r:any){if(r.error)throw Error(r.error.message||String(r.error));return r.data;}
async function get(url:string){const r=await fetch(url,{redirect:"error",headers:{"User-Agent":"Mozilla/5.0 PTCG official public deck archive","Accept-Language":"zh-TW"},signal:AbortSignal.timeout(16000)});if(!r.ok)throw Error("source HTTP "+r.status);return r;}
async function git(file:string){return await (await get("https://raw.githubusercontent.com/guoer11/ptcg-ranking/main/data/"+file)).json();}
async function sync(){
 const [t,m]=await Promise.all([git("tournaments.json"),git("preliminary_sources.json")]);
 const events=(t.events||[]).filter((e:any)=>validEvent(String(e.event_id))&&/^\d{4}-\d{2}-\d{2}$/.test(e.date||"")&&e.date<=today()&&["Great","Ultra","Premier","Master"].includes(e.league));
 const known=new Set(events.map((e:any)=>String(e.event_id)));
 // Existing official event identity is preserved; no unverified date/title matching.
 for(let i=0;i<events.length;i+=100)check(await db.from("official_deck_events").upsert(events.slice(i,i+100).map((e:any)=>({event_id:String(e.event_id),event_date:e.date,title:String(e.title||"").slice(0,200),league:e.league,division:String(e.group||"")})),{onConflict:"event_id",ignoreDuplicates:true}));
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
 return {events:events.length,mappings:map.length,autoMapped};
}
async function discover(event:any){
 const claim=check(await db.from("official_deck_events").update({next_check_at:later(20)}).eq("event_id",event.event_id).eq("next_check_at",event.next_check_at).select("event_id"));
 if(!claim.length)return {event:event.event_id,skipped:true};
 try{
  const html=await (await get(ORIGIN+"/tw/event-search/"+event.event_id+"/")).text();
  const rows=parseEvent(html);
  const codes=[...new Set(rows.map(r=>r.code))];
  if(codes.length)check(await db.from("official_deck_recipes").upsert(codes.map(code=>({code})),{onConflict:"code",ignoreDuplicates:true}));
  if(rows.length)check(await db.from("official_deck_entries").upsert(rows.map(r=>({...r,event_id:event.event_id})),{onConflict:"event_id,player_id",ignoreDuplicates:true}));
  const recent=Date.now()-Date.parse(event.event_date+"T00:00:00+08:00")<30*86400000;
  check(await db.from("official_deck_events").update({checked_at:now(),next_check_at:later(recent?480:10080)}).eq("event_id",event.event_id));
  return {event:event.event_id,links:rows.length};
 }catch(e){console.warn("official deck discovery",event.event_id,String(e));return {event:event.event_id,error:String(e)};}
}
async function capture(row:any,budget:{remaining:number}){
 if(!validCode(row.code))return {error:"invalid code"};
 const attempts=row.attempts+1;
 const claim=check(await db.from("official_deck_recipes").update({next_attempt_at:later(Math.min(1440,15*2**Math.min(attempts-1,6))),attempts}).eq("code",row.code).eq("next_attempt_at",row.next_attempt_at).is("captured_at",null).select("code"));
 if(!claim.length)return {skipped:true};
 try{
  const cards=Array.isArray(row.cards)?row.cards:parseRecipe(await (await get(ORIGIN+"/tw/deck-build/recipe/"+row.code+"/")).text());
  if(!row.cards)check(await db.from("official_deck_recipes").update({cards}).eq("code",row.code));
  if(budget.remaining<=0){check(await db.from("official_deck_recipes").update({next_attempt_at:later(1440)}).eq("code",row.code));return {code:row.code,cards:60,image_pending:"storage safety limit"};}
  const r=await get(ORIGIN+"/tw/deck-img/"+row.code+".png");
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(!isPng(bytes)||bytes.length>8388608)throw Error("invalid or oversized original PNG");
  if(bytes.length>budget.remaining){check(await db.from("official_deck_recipes").update({next_attempt_at:later(1440)}).eq("code",row.code));return {code:row.code,cards:60,image_pending:"storage safety limit"};}
  budget.remaining-=bytes.length;
  const path=row.code+".png";
  const upload=await bucket.upload(path,bytes,{contentType:"image/png",upsert:false});
  if(upload.error){
   // Recover only if the immutable object already exists and is a valid PNG.
   const existing=await bucket.download(path);
   if(existing.error||!existing.data||!isPng(new Uint8Array(await existing.data.arrayBuffer())))throw upload.error;
  }
  check(await db.from("official_deck_recipes").update({cards,image_path:path,captured_at:now()}).eq("code",row.code).is("captured_at",null));
  return {saved:true,code:row.code,cards:cards.reduce((sum,c)=>sum+c.count,0),bytes:bytes.length};
 }catch(e){console.warn("official deck capture",row.code,String(e));return {code:row.code,error:String(e)};}
}
async function poll(eventId:string,recipeCode:string){
 let q=db.from("official_deck_events").select("event_id,event_date,next_check_at").lte("next_check_at",now());
 if(eventId)q=q.eq("event_id",eventId);
 const events=check(await q.order("next_check_at").order("event_date",{ascending:false}).limit(2));
 const discovery=[];
 for(const event of events)discovery.push(await discover(event));
 const due=()=>db.from("official_deck_recipes").select("code,attempts,next_attempt_at,cards").is("captured_at",null).lte("next_attempt_at",now());
 let recipes:any[]=[];
 if(recipeCode)recipes=check(await due().eq("code",recipeCode).limit(1));
 else{
  const mapped=check(await db.from("official_deck_event_map").select("event_id").limit(200));
  const eventIds=[...new Set(mapped.map((x:any)=>x.event_id))];
  if(eventIds.length){
   const linked=check(await db.from("official_deck_entries").select("code").in("event_id",eventIds).limit(200));
   const codes=[...new Set(linked.map((x:any)=>x.code))];
   if(codes.length)recipes=check(await due().in("code",codes).order("next_attempt_at").limit(8));
  }
  if(recipes.length<8){const more=check(await due().order("next_attempt_at").limit(16));const seen=new Set(recipes.map(x=>x.code));recipes.push(...more.filter((x:any)=>!seen.has(x.code)).slice(0,8-recipes.length));}
 }
 // Keep a conservative 750 MiB safety ceiling for this independent archive.
 // Text data is retained even when the original image cannot be archived.
 let used=0;
 for(let offset=0;offset<5000;offset+=100){
  const objects=check(await bucket.list("",{limit:100,offset,sortBy:{column:"name",order:"asc"}}))||[];
  for(const object of objects)used+=Number(object.metadata?.size||0);
  if(objects.length<100)break;
 }
 const budget={remaining:Math.max(0,750*1024*1024-used)},captures=[];
 for(let i=0;i<recipes.length;i+=3)captures.push(...await Promise.all(recipes.slice(i,i+3).map(row=>capture(row,budget))));
 return {discovery,captures};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({ok:false},405);
 try{
  const config=check(await db.rpc("get_ptcg_github_trigger_config_for_service"));
  const secret=String(config?.cron_secret||"");
  if(!secret||req.headers.get("x-ptcg-cron-secret")!==secret)return json({ok:false,error:"unauthorized"},403);
  const body=await req.json();
  if(body.action==="sync")return json({ok:true,...await sync()});
  if(body.action!=="poll")return json({ok:false,error:"invalid action"},400);
  const eventId=String(body.event_id||""),code=String(body.code||"");
  if(eventId&&!validEvent(eventId)||code&&!validCode(code))return json({ok:false,error:"invalid identifier"},400);
  return json({ok:true,...await poll(eventId,code)});
 }catch(e){console.error("official deck archive",String(e));return json({ok:false,error:String(e)},500);}
});
