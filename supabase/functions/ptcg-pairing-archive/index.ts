import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sourceTid, validTid, officialUrl, publishedRounds, captureRound, captureFinal, fingerprint, parseMatchRows } from "./source.ts";

const URL_BASE=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL_BASE,KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const cors={"Access-Control-Allow-Origin":"https://guoer11.github.io",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const now=()=>new Date().toISOString();
const addMinutes=(mins:number)=>new Date(Date.now()+mins*60_000).toISOString();

async function requireMember(req:Request) {
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)throw new Error("請先登入授權帳號");
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user)throw new Error("授權驗證失敗");
  const {data:allowed,error:permissionError}=await db.rpc("is_pairing_authorized",{target_user:data.user.id});
  if(permissionError||!allowed)throw new Error("沒有即時配對查詢權限");
  return data.user;
}
async function requireCron(req:Request) {
  const {data,error}=await db.rpc("get_ptcg_github_trigger_config_for_service");
  if(error)throw error;
  const expected=String(data?.cron_secret||"");
  const sent=String(req.headers.get("x-ptcg-cron-secret")||"");
  if(!expected||sent!==expected)throw new Error("排程授權失敗");
}
async function insertArchive(tid:string,url:string,title="") {
  if(!validTid(tid))throw new Error("TID 不正確");
  const {error}=await db.from("ptcg_match_archives").insert({
    tid,title:title.slice(0,200),source_url:url,
    poll_until:addMinutes(3*24*60)
  });
  if(error && error.code!=="23505")throw error;
  return tid;
}
async function watchDiscovery() {
  const {data,error}=await db.from("pairing_watches")
    .select("tid,source_url,active,updated_at")
    .eq("active",true).order("updated_at",{ascending:false}).limit(100);
  if(error)throw error;
  let added=0;
  for(const w of data||[]) {
    const tid=String(w.tid||"");
    if(!validTid(tid))continue;
    try {
      if(sourceTid(String(w.source_url||""))!==tid)continue;
      await insertArchive(tid,String(w.source_url));
      added++;
    } catch(e){console.warn("watch archive discovery",tid,String(e));}
  }
  return added;
}
async function saveRound(tid:string,round:number) {
  const result=await captureRound(tid,round);
  if(!result)return {round,available:false};
  const checksum=await fingerprint(result.matches);
  const existing=await db.from("ptcg_match_archive_rounds")
    .select("fingerprint").eq("tid",tid).eq("round_no",round).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.fingerprint===checksum)return {round,available:true,changed:false};
  const {error}=await db.from("ptcg_match_archive_rounds").upsert({
    tid,round_no:round,source_url:result.source_url,
    player_count:result.player_count,table_count:result.table_count,
    matches:result.matches,fingerprint:checksum,
    checked_at:now(),...(existing.data?{}:{captured_at:now()})
  },{onConflict:"tid,round_no"});
  if(error)throw error;
  return {round,available:true,changed:true,players:result.player_count};
}
async function saveFinal(tid:string) {
  const result=await captureFinal(tid);
  if(!result)return {available:false};
  const checksum=await fingerprint(result.standings);
  const existing=await db.from("ptcg_match_archive_finals").select("fingerprint")
    .eq("tid",tid).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.fingerprint!==checksum) {
    const {error}=await db.from("ptcg_match_archive_finals").upsert({
      tid,source_url:result.source_url,
      player_count:result.player_count,standings:result.standings,
      fingerprint:checksum,
      ...(existing.data?{}:{captured_at:now()})
    },{onConflict:"tid"});
    if(error)throw error;
  }
  return {available:true,changed:existing.data?.fingerprint!==checksum,
    players:result.player_count};
}
async function pollEvent(event:any) {
  const tid=String(event.tid);
  const ts=now();
  // Store check timestamp before network access, so overlapping jobs skip this event.
  const {error:lockError}=await db.from("ptcg_match_archives")
    .update({last_checked_at:ts,updated_at:ts})
    .eq("tid",tid);
  if(lockError)throw lockError;

  let title=String(event.title||"");
  const detail:any={tid,rounds:[],final:false};
  try {
    const published=await publishedRounds(tid);
    title=published.title||title;
    const existingRound=Number(event.last_round||0);
    const saved=await db.from("ptcg_match_archive_rounds").select("round_no").eq("tid",tid);
    if(saved.error)throw saved.error;
    const savedRounds=new Set((saved.data||[]).map(r=>Number(r.round_no)));
    const sourceStart=Number(new URL(event.source_url).searchParams.get("kno")||1);
    // Revisit missing rounds on later polls: a temporarily unavailable Round 1
    // must not be lost forever just because Round 2/3 was already saved.
    const highest=Math.min(40,Math.max(0,existingRound,...published.rounds,
      Number.isInteger(sourceStart)&&sourceStart>=1&&sourceStart<=40?sourceStart:1));
    const candidates=Array.from({length:highest},(_,i)=>i+1)
      .filter(round=>!savedRounds.has(round));
    const newRounds=candidates.slice(0,3);
    const targetRounds=[...newRounds];
    if(!targetRounds.length&&existingRound>0)targetRounds.push(existingRound);
    let savedRound=existingRound;
    for(const r of targetRounds) {
      try {
        const state=await saveRound(tid,r);
        detail.rounds.push(state);
        if(state.available)savedRound=Math.max(savedRound,r);
      } catch(e){detail.rounds.push({round:r,error:String((e as Error).message||e).slice(0,180)});}
    }
    let final:any={available:false};
    try {final=await saveFinal(tid);}catch(e){detail.final_error=String((e as Error).message||e).slice(0,180);}
    detail.final=final.available;
    const finalized=Boolean(event.final_seen_at||final.available);
    const firstFinal=final.available && !event.final_seen_at;
    const completed=finalized && event.final_seen_at
      && Date.now()-new Date(event.final_seen_at).getTime()>=30*60_000;
    const {error}=await db.from("ptcg_match_archives").update({
      title, last_round:savedRound,status:completed?"completed":"collecting",
      last_success_at:now(),last_error:null,updated_at:now(),
      ...(firstFinal?{final_seen_at:now(),poll_until:addMinutes(45)}:{})
    }).eq("tid",tid);
    if(error)throw error;
    return { ...detail,completed};
  }catch(e) {
    const message=String((e as Error).message||e).slice(0,300);
    await db.from("ptcg_match_archives").update({last_error:message,updated_at:now()}).eq("tid",tid);
    return { ...detail,error:message};
  }
}
async function pollAll() {
  const discovered=await watchDiscovery();
  // Expiry never deletes archived content, only disables further network polling.
  await db.from("ptcg_match_archives").update({status:"expired",updated_at:now()})
    .eq("status","collecting").lt("poll_until",now()).is("final_seen_at",null);
  await db.from("ptcg_match_archives").update({status:"completed",updated_at:now()})
    .eq("status","collecting").lt("poll_until",now()).not("final_seen_at","is",null);
  const {data,error}=await db.from("ptcg_match_archives").select("*")
    .eq("status","collecting").gt("poll_until",now())
    .order("last_checked_at",{ascending:true,nullsFirst:true}).limit(6);
  if(error)throw error;
  const results:any[]=[];
  for(const event of data||[])results.push(await pollEvent(event));
  return {discovered,polled:results.length,results};
}
async function listArchives() {
  const {data,error}=await db.from("ptcg_match_archives")
    .select("tid,title,status,parent_tid,first_seen_at,last_checked_at,last_round,final_seen_at,last_error")
    .order("first_seen_at",{ascending:false}).limit(100);
  if(error)throw error;
  return data||[];
}
async function readArchive(tid:string,round?:number) {
  if(!validTid(tid))throw new Error("TID 無效");
  const ev=await db.from("ptcg_match_archives").select("*").eq("tid",tid).maybeSingle();
  if(ev.error)throw ev.error;
  if(!ev.data)return null;
  const list=await db.from("ptcg_match_archive_rounds")
    .select("round_no,captured_at,player_count,table_count,source_url")
    .eq("tid",tid).order("round_no",{ascending:true});
  if(list.error)throw list.error;
  let details:any=null;
  if(round&&Number.isInteger(round)&&round>=1&&round<=100) {
    const r=await db.from("ptcg_match_archive_rounds").select("*")
      .eq("tid",tid).eq("round_no",round).maybeSingle();
    if(r.error)throw r.error;
    details=r.data;
  }
  const final=await db.from("ptcg_match_archive_finals")
    .select("captured_at,player_count,source_url,standings").eq("tid",tid).maybeSingle();
  if(final.error)throw final.error;
  return {event:ev,rounds:list.data||[],selected:details,final:final.data};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method not allowed"},405);
  try {
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"");
    if(action==="selftest") {
      await requireCron(req);
      const example=[
        ["Table","Name","Opponent"],
        ["34","tw02559687 王品澤 (0/0/0 (0))","vs.","tw54152249 Yuhung (0/0/0 (0))"],
        ["34","tw54152249 Yuhung (0/0/0 (0))","vs.","tw02559687 王品澤 (0/0/0 (0))"],
        ["Bye","tw94609089 tw94609089 (1/0/0 (3))"]
      ];
      const parsed=parseMatchRows(example);
      if(parsed.table_count!==2 || parsed.player_count!==3
        || parsed.matches[0]?.a?.name!=="王品澤"
        || parsed.matches.at(-1)?.kind!=="bye")
        throw new Error("archive parser selftest failed");
      return json({ok:true,tables:parsed.table_count,players:parsed.player_count,
        bye:parsed.matches.at(-1)?.kind==="bye"});
    }
    if(action==="poll") {
      await requireCron(req);
      return json({ok:true,...await pollAll()});
    }
    await requireMember(req);
    if(action==="register") {
      const tid=sourceTid(String(body?.url||""));
      await insertArchive(tid,String(body?.url||""));
      return json({ok:true,tid});
    }
    if(action==="list")return json({ok:true,archives:await listArchives()});
    if(action==="get")return json({ok:true,archive:await readArchive(String(body?.tid||""),body?.round==null?undefined:Number(body.round))});
    if(action==="link") {
      const tid=String(body?.tid||""),parent=String(body?.day1_tid||"");
      if(!validTid(tid)||!validTid(parent)||tid===parent)throw new Error("Day 1 / Day 2 TID 不正確");
      const found=await db.from("ptcg_match_archives").select("tid").in("tid",[tid,parent]);
      if(found.error)throw found.error;
      if(found.data?.length!==2)throw new Error("請先建立 Day 1 和 Day 2 的封存");
      const upd=await db.from("ptcg_match_archives").update({parent_tid:parent,updated_at:now()}).eq("tid",tid);
      if(upd.error)throw upd.error;
      return json({ok:true,tid,day1_tid:parent});
    }
    return json({ok:false,error:"invalid action"},400);
  }catch(e){
    const message=String((e as Error).message||e);
    console.warn("match archive",message);
    return json({ok:false,error:message},/授權|權限|登入|排程授權/.test(message)?403:400);
  }
});
