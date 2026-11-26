import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sourceTid, validTid, officialUrl, publishedRounds, captureRound, captureFinal, captureInterim, fingerprint, parseMatchRows, standingsFromRows } from "./source.ts";

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

async function requireMember(req:Request,allowGuest=false) {
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)throw new Error("請先登入授權帳號");
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user)throw new Error("授權驗證失敗");
  const {data:allowed,error:permissionError}=await db.rpc(allowGuest?"is_pairing_member":"is_pairing_authorized",{target_user:data.user.id});
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
async function saveInterim(tid:string,round:number) {
  const result=await captureInterim(tid,round);
  if(!result)return {available:false,round};
  const checksum=await fingerprint(result.standings);
  const existing=await db.from("ptcg_match_archive_interims")
    .select("fingerprint").eq("tid",tid).eq("round_no",round).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.fingerprint!==checksum) {
    const {error}=await db.from("ptcg_match_archive_interims").upsert({
      tid,round_no:round,source_url:result.source_url,
      player_count:result.player_count,standings:result.standings,
      fingerprint:checksum,checked_at:now(),
      ...(existing.data?{}:{captured_at:now()})
    },{onConflict:"tid,round_no"});
    if(error)throw error;
  }
  return {available:true,round,players:result.player_count,
    changed:existing.data?.fingerprint!==checksum};
}
async function saveFinal(tid:string,expectedRounds:number|null=null) {
  const result=await captureFinal(tid,expectedRounds);
  if(!result)return {available:false};
  const checksum=await fingerprint(result.standings);
  const existing=await db.from("ptcg_match_archive_finals").select("fingerprint")
    .eq("tid",tid).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.fingerprint!==checksum) {
    const {error}=await db.from("ptcg_match_archive_finals").upsert({
      tid,source_url:result.source_url,
      player_count:result.player_count,standings:result.standings,
      source_status:result.source_status,fingerprint:checksum,
      ...(existing.data?{}:{captured_at:now()})
    },{onConflict:"tid"});
    if(error)throw error;
  }
  return {available:true,changed:existing.data?.fingerprint!==checksum,
    players:result.player_count};
}
// A completed final snapshot can initiate trial import immediately; the
// existing nightly Supabase cron remains a backup if GitHub is unavailable.
async function triggerPreliminarySync() {
  const {data,error}=await db.rpc("get_ptcg_github_trigger_config_for_service");
  if(error)throw error;
  const secret=String(data?.cron_secret||"");
  if(!secret)throw new Error("試算匯入排程密鑰尚未設定");
  const resp=await fetch(URL_BASE+"/functions/v1/ptcg-github-trigger",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-ptcg-cron-secret":secret},
    body:JSON.stringify({workflow:"sync-preliminary.yml"}),
    signal:AbortSignal.timeout(18000)
  });
  if(!resp.ok)throw new Error("試算同步觸發失敗（HTTP "+resp.status+"）");
  return {triggered:true};
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
    // Preserve interim rankings separately until official final standings exist.
    if(published.interimRounds?.length) {
      const interimRound=published.interimRounds.at(-1)!;
      try {detail.interim=await saveInterim(tid,interimRound);}
      catch(e){detail.interim_error=String((e as Error).message||e).slice(0,180);}
    }
    let final:any={available:false};
    try {final=await saveFinal(tid,event.expected_rounds==null?null:Number(event.expected_rounds));}catch(e){detail.final_error=String((e as Error).message||e).slice(0,180);}
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
    if(completed) {
      try {detail.trial_sync=await triggerPreliminarySync();}
      catch(syncError) {
        // Archive completion is durable even if the dispatch fails.
        // The scheduled sync-preliminary cron retries it separately.
        detail.trial_sync_error=String((syncError as Error).message||syncError).slice(0,180);
        console.warn("archive-to-trial-dispatch",tid,detail.trial_sync_error);
      }
    }
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
  const tids=(data||[]).map(row=>row.tid);
  if(!tids.length)return [];
  const interim=await db.from("ptcg_match_archive_interims").select("tid,round_no").in("tid",tids);
  if(interim.error)throw interim.error;
  const rounds=new Map<string,number>();
  for(const row of interim.data||[])rounds.set(row.tid,Math.max(rounds.get(row.tid)||0,Number(row.round_no)));
  return (data||[]).map(row=>({...row,interim_round:rounds.get(row.tid)||null}));
}
// Private overlays are resolved only after the same pairing authorization as the
// existing scout page; the original scout/history tables are read-only here.
async function archivePlayerContext(tid:string,eventTitle:string,roundRows:any,finalRows:any,userId:string) {
  const ids=new Set<string>();
  for(const m of roundRows?.matches||[])for(const p of [m.a,m.b])
    if(/^tw\d+$/i.test(String(p?.id||"")))ids.add(String(p.id).toLowerCase());
  for(const p of finalRows?.standings||[])if(/^tw\d+$/i.test(String(p?.id||"")))ids.add(String(p.id).toLowerCase());
  const participants=[...ids];
  const realNames:Record<string,string>={};
  const decks:Record<string,{current?:any;previous?:any}>={};
  const observations:Record<string,{deck_a:string;deck_b:string}>={};
  if(!participants.length)return {real_names:realNames,decks,observations};
  const chunks:string[][]=[];
  for(let i=0;i<participants.length;i+=150)chunks.push(participants.slice(i,i+150));
  // Historical decks must predate this event; never show later records as a
  // prior tournament reference.
  const dateMatch=String(eventTitle||"").match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  const cutoff=dateMatch
    ? new Date([dateMatch[1],dateMatch[2].padStart(2,"0"),dateMatch[3].padStart(2,"0")].join("-")+"T23:59:59+08:00").toISOString()
    : "";
  // Independent read-only queries can run together, without 4+ successive
  // network round-trips for each historical tournament.
  const identityQueries=chunks.map(chunk=>db.from("player_identities")
    .select("player_id,real_name").in("player_id",chunk));
  const currentQuery=db.from("pairing_shared_scouts")
    .select("player_id,deck_name,observed_round,tid,created_at")
    .eq("conflict",false).eq("tid",tid).limit(5000);
  const historyQueries=chunks.map(chunk=>{
    let query=db.from("pairing_shared_scouts")
      .select("player_id,deck_name,tid,created_at")
      .eq("conflict",false).neq("tid",tid).in("player_id",chunk)
      .order("created_at",{ascending:false}).limit(500);
    if(cutoff)query=query.lte("created_at",cutoff);
    return query;
  });
  const observationsQuery=db.from("pairing_shared_pairs")
    .select("round_no,table_no,deck_a,deck_b")
    .eq("conflict",false).eq("tid",tid).limit(5000);
  const [identities,current,historical,observationRows]=await Promise.all([
    Promise.all(identityQueries),currentQuery,Promise.all(historyQueries),observationsQuery
  ]);
  for(const result of identities){
    if(result.error)throw result.error;
    for(const row of result.data||[])if(row.real_name)
      realNames[String(row.player_id).toLowerCase()]=String(row.real_name);
  }
  if(current.error)throw current.error;
  for(const row of current.data||[]) {
    const id=String(row.player_id||"").toLowerCase();
    if(ids.has(id)&&row.deck_name)
      decks[id]={...decks[id],current:{deck:String(row.deck_name),round:row.observed_round,tid}};
  }
  for(const result of historical){
    if(result.error)throw result.error;
    for(const row of result.data||[]) {
      const id=String(row.player_id||"").toLowerCase();
      if(!ids.has(id)||decks[id]?.previous||!row.deck_name)continue;
      decks[id]={...decks[id],previous:{deck:String(row.deck_name),tid:String(row.tid),date:row.created_at}};
    }
  }
  if(observationRows.error)throw observationRows.error;
  for(const row of observationRows.data||[])if(row.deck_a||row.deck_b)
    observations[String(row.round_no)+":"+String(row.table_no)]={deck_a:String(row.deck_a||""),deck_b:String(row.deck_b||"")};
  return {real_names:realNames,decks,observations};
}
// Read-only, round-scoped roster for private deck scout. Never search unrelated events.
async function scoutRoster(tid:string,round:number) {
  if(!validTid(tid)||!Number.isInteger(round)||round<1||round>40)
    throw new Error("請確認活動 TID 與 Round（1–40）");
  const saved=await db.from("ptcg_match_archive_rounds")
    .select("matches,player_count").eq("tid",tid).eq("round_no",round).maybeSingle();
  if(saved.error)throw saved.error;
  let data=saved.data;
  let source="archive";
  if(!data?.matches?.length){
    data=await captureRound(tid,round);
    source="official";
  }
  if(!data?.matches?.length)
    return {ok:true,tid,round,available:false,player_ids:[]};
  const ids=[...new Set<string>(data.matches.flatMap((match:any)=>[match.a?.id,match.b?.id])
    .map((id:any)=>String(id||"").toLowerCase()).filter((id:string)=>/^tw\d+$/.test(id)))];
  if(!ids.length||ids.length!==Number(data.player_count))
    throw new Error("本輪參賽名單尚未完整，請稍後重試");
  return {ok:true,tid,round,available:true,source,player_ids:ids};
}
async function readArchive(tid:string,round:number|undefined,userId:string) {
  if(!validTid(tid))throw new Error("TID 無效");
  const selectedRound=round&&Number.isInteger(round)&&round>=1&&round<=100?round:null;
  const [ev,list,selected,final,knockout,interim]=await Promise.all([
    db.from("ptcg_match_archives").select("*").eq("tid",tid).maybeSingle(),
    db.from("ptcg_match_archive_rounds")
      .select("round_no,captured_at,player_count,table_count,source_url")
      .eq("tid",tid).order("round_no",{ascending:true}),
    selectedRound?db.from("ptcg_match_archive_rounds").select("*")
      .eq("tid",tid).eq("round_no",selectedRound).maybeSingle()
      :Promise.resolve({data:null,error:null}),
    db.from("ptcg_match_archive_finals")
      .select("captured_at,player_count,source_url,source_status,standings").eq("tid",tid).maybeSingle(),
    db.from("ptcg_match_archive_knockouts")
      .select("event_id,podium,updated_at").eq("tid",tid).maybeSingle(),
    db.from("ptcg_match_archive_interims")
      .select("captured_at,round_no,player_count,source_url,standings")
      .eq("tid",tid).order("round_no",{ascending:false}).limit(1).maybeSingle()
  ]);
  for(const result of [ev,list,selected,final,knockout,interim])
    if(result.error)throw result.error;
  if(!ev.data)return null;
  // Final TtlScore references are not official final LP; retrieve the last
  // saved pre-round points concurrently with the private player/deck context.
  const referenceQuery=final.data?.standings?.some((row:any)=>row.points==null)
    ?db.from("ptcg_match_archive_rounds").select("round_no,matches")
      .eq("tid",tid).order("round_no",{ascending:false}).limit(1).maybeSingle()
    :Promise.resolve({data:null,error:null});
  const [context,recent]=await Promise.all([
    archivePlayerContext(tid,String(ev.data.title||""),selected.data,final.data||interim.data,userId),
    referenceQuery
  ]);
  if(recent.error)throw recent.error;
  let finalScoreReferences:any=null;
  if(recent.data){
    const scores:Record<string,number>={};
    for(const row of recent.data.matches||[]) {
      for(const p of [row.a,row.b]){
        const id=String(p?.id||"").toLowerCase();
        const value=p?.record?.points;
        if(/^tw[0-9]{6,12}$/.test(id)&&typeof value==="number"&&Number.isFinite(value))
          scores[id]=value;
      }
    }
    finalScoreReferences={before_round:recent.data.round_no,points:scores};
  }
  return {event:ev.data,rounds:list.data||[],selected:selected.data,
    final:final.data,final_score_references:finalScoreReferences,
    interim:interim.data,knockout:knockout.data,context};
}
async function repairFinalScores(tid:string) {
  if(!validTid(tid))throw new Error("TID 不正確");
  const event=await db.from("ptcg_match_archives").select("expected_rounds")
    .eq("tid",tid).maybeSingle();
  if(event.error||!event.data)throw new Error("找不到封存賽事");
  const existing=await db.from("ptcg_match_archive_finals")
    .select("standings,source_status").eq("tid",tid).maybeSingle();
  if(existing.error||!Array.isArray(existing.data?.standings))throw new Error("找不到封存最終排名");
  const actual=await captureFinal(tid,event.data.expected_rounds==null?null:Number(event.data.expected_rounds));
  if(!actual?.standings?.length)
    return {ok:true,tid,repaired:false,reason:"官方最終排名已關閉或無法讀取"};
  const previous=existing.data.standings;
  if(actual.standings.length!==previous.length)throw new Error("人數改變，拒絕覆蓋原封存");
  const ids=new Map(previous.map((p:any)=>[String(p.id).toLowerCase(),Number(p.rank)]));
  if(actual.standings.some((p:any)=>ids.get(String(p.id).toLowerCase())!==Number(p.rank)))
    throw new Error("最終名次改變，拒絕覆蓋原封存");
  let improved=0;
  const incoming=new Map(actual.standings.map((p:any)=>[String(p.id).toLowerCase(),p.points]));
  const merged=previous.map((p:any)=>{
    const score=incoming.get(String(p.id).toLowerCase());
    if(p.points==null&&typeof score==="number"&&Number.isFinite(score))improved++;
    return {...p,points:typeof score==="number"&&Number.isFinite(score)?score:p.points};
  });
  if(!improved)return {ok:true,tid,repaired:false,reason:"來源未提供更多最終 TtlScore",scores:0};
  const upd=await db.from("ptcg_match_archive_finals")
    .update({standings:merged,fingerprint:await fingerprint(merged)}).eq("tid",tid);
  if(upd.error)throw upd.error;
  return {ok:true,tid,repaired:true,scores:improved};
}
const OWNER="guoer11",REPO="ptcg-ranking";
async function publicGitJson(file:string) {
  if(!["data/preliminary_sources.json","data/tournaments.json","data/knockout_results.json"].includes(file))
    throw new Error("不允許讀取其他賽事設定");
  const response=await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${file}`,{
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error("試算來源暫時無法驗證，請稍後再試");
  return await response.json();
}
// 手動 TOP8 對戰樹：僅記錄本人確認的勝者，未確認不可推斷晉級。
// 使用既有 private knockout.podium JSONB，避免另建公開資料表。
const BRACKET_KEYS=["qf1","qf2","qf3","qf4","sf1","sf2","final"] as const;
type BracketWinners=Record<string,string>;
function cleanWinners(raw:any):BracketWinners {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).some(k=>!BRACKET_KEYS.includes(k as typeof BRACKET_KEYS[number])))throw new Error("複賽勝負資料格式不正確");
  const out:BracketWinners={};
  for(const k of BRACKET_KEYS){const id=String(raw[k]||"").trim().toLowerCase();if(id&&!/^tw[0-9]{6,12}$/.test(id))throw new Error("勝者 ID 不符合格式");out[k]=id;}
  return out;
}
function isJuniorUltra(title:string){return /(UBL|高級球)/i.test(title)&&/(孩童|Junior)/i.test(title);}
function verifiedTop(final:any){
  const all=final?.standings;
  if(!Array.isArray(all)||all.length<9||Number(final.player_count)!==all.length||!["official_final","completed_last_round"].includes(String(final.source_status)))throw new Error("完整的預賽最終排名尚未封存");
  const top=all.filter((p:any)=>Number.isInteger(p.rank)&&p.rank>=1&&p.rank<=8);
  if(top.length!==8||new Set(top.map((p:any)=>p.rank)).size!==8||new Set(top.map((p:any)=>String(p.id).toLowerCase())).size!==8||top.some((p:any)=>!/^tw[0-9]{6,12}$/.test(String(p.id).toLowerCase())))throw new Error("無法確認完整且不重複的預賽前八名");
  return top;
}
function bracketParticipants(top:any[],winners:BracketWinners){
  const ranked=new Map<number,string>(top.map((p:any)=>[p.rank,String(p.id).toLowerCase()]));
  return {qf1:[ranked.get(1)!,ranked.get(8)!],qf2:[ranked.get(4)!,ranked.get(5)!],qf3:[ranked.get(3)!,ranked.get(6)!],qf4:[ranked.get(2)!,ranked.get(7)!],sf1:[winners.qf1,winners.qf2],sf2:[winners.qf3,winners.qf4],final:[winners.sf1,winners.sf2]} as Record<string,string[]>;
}
function invalidWinners(top:any[],winners:BracketWinners){
  const participants=bracketParticipants(top,winners);
  return BRACKET_KEYS.filter(k=>winners[k]&&(!participants[k][0]||!participants[k][1]||!participants[k].includes(winners[k])));
}
function mergeBracket(top:any[],base:BracketWinners,stored:BracketWinners,incoming:BracketWinners){
  const winners={...stored}, conflicts:string[]=[];
  for(const k of BRACKET_KEYS){if(incoming[k]===base[k])continue;if(stored[k]!==base[k]&&stored[k]!==incoming[k])conflicts.push(k);else winners[k]=incoming[k];}
  conflicts.push(...invalidWinners(top,winners));
  return {winners,conflicts:[...new Set(conflicts)]};
}
async function memberEvent(userId:string,tid:string){
  const {data:admin,error}=await db.rpc("is_pairing_authorized",{target_user:userId});
  if(error)throw error;
  if(admin===true)return true;
  const watch=await db.from("pairing_watches").select("tid").eq("user_id",userId).eq("tid",tid).limit(1);
  if(watch.error)throw watch.error;
  if(!watch.data?.length)throw new Error("只能操作自己追蹤中的賽事或最近追蹤的賽事");
  return false;
}
async function currentKnockout(tid:string){
  const [event,final,knockout]=await Promise.all([
    db.from("ptcg_match_archives").select("tid,title,final_seen_at,expected_rounds,status,last_checked_at").eq("tid",tid).maybeSingle(),
    db.from("ptcg_match_archive_finals").select("player_count,standings,source_status").eq("tid",tid).maybeSingle(),
    db.from("ptcg_match_archive_knockouts").select("event_id,podium,updated_at").eq("tid",tid).maybeSingle()
  ]);
  for(const r of [event,final,knockout])if(r.error)throw r.error;
  return {event:event.data,final:final.data,knockout:knockout.data};
}
async function liveKnockout(body:any,userId:string,readOnly=false){
  let tid=String(body?.tid||"");
  const watch=readOnly?{data:null,error:null}:await db.from("pairing_watches").select("tid,source_url,final_notified").eq("user_id",userId).maybeSingle();
  if(watch.error)throw watch.error;
  if(!tid)tid=String(watch.data?.tid||"");
  if(!validTid(tid))return {ok:true,archive:null};
  if(!readOnly)await memberEvent(userId,tid);
  let state=await currentKnockout(tid);
  // Final notification can precede the five-minute archive job. Confirm against the
  // official standings directly, never infer a final from the user's selection.
  if(!readOnly&&watch.data?.tid===tid&&watch.data.final_notified&&!state.event?.final_seen_at){
    if(!state.event&&sourceTid(String(watch.data.source_url))===tid)await insertArchive(tid,String(watch.data.source_url));
    const lock=await db.from("ptcg_match_archives").update({last_checked_at:now()}).eq("tid",tid).is("final_seen_at",null)
      .or("last_checked_at.is.null,last_checked_at.lt."+new Date(Date.now()-30000).toISOString()).select("tid,expected_rounds").maybeSingle();
    if(lock.error)throw lock.error;
    if(lock.data){
      try{
        const published=await publishedRounds(tid);
        if(isJuniorUltra(String(published.title||""))){
          const final=await saveFinal(tid,lock.data.expected_rounds==null?null:Number(lock.data.expected_rounds));
          if(final.available)await db.from("ptcg_match_archives").update({title:published.title,final_seen_at:now(),poll_until:addMinutes(45),updated_at:now()}).eq("tid",tid).is("final_seen_at",null);
        }
      }catch(e){console.warn("live-top8-final",tid,String(e).slice(0,120));}
      state=await currentKnockout(tid);
    }
  }
  if(!state.event?.final_seen_at||!isJuniorUltra(String(state.event.title||"")))return {ok:true,archive:null,tid};
  let top:any[];try{top=verifiedTop(state.final);}catch(_){return {ok:true,archive:null,tid};}
  const ids=top.map(p=>String(p.id).toLowerCase());
  const [names,decks]=await Promise.all([
    db.from("player_identities").select("player_id,real_name").in("player_id",ids),
    db.from("pairing_shared_scouts").select("player_id,deck_name").eq("tid",tid).eq("conflict",false).in("player_id",ids)
  ]);
  if(names.error||decks.error)throw names.error||decks.error;
  const context={real_names:Object.fromEntries((names.data||[]).map(r=>[r.player_id,r.real_name])),decks:Object.fromEntries((decks.data||[]).map(r=>[r.player_id,{current:{deck:r.deck_name}}]))};
  // Only Top 8 and a count sentinel are exposed by this route, not the archive center.
  const knockout=state.knockout?{...state.knockout,podium:{...state.knockout.podium}}:null;
  if(knockout?.podium?.bracket){
    const {audit,updated_by,...safe}=knockout.podium.bracket;
    if(safe.conflict){const {reported_by,...conflict}=safe.conflict;safe.conflict=conflict;}
    knockout.podium.bracket=safe;
  }
  return {ok:true,tid,archive:{event:{tid,title:state.event.title,final_seen_at:state.event.final_seen_at},final:{standings:[...top,{rank:9}]},knockout,context}};
}
async function writeKnockout(tid:string,eventId:string,podium:any,existing:any){
  const revision=new Date(Math.max(Date.now(),(existing?Date.parse(existing.updated_at):0)+1)).toISOString();
  const row={tid,event_id:eventId,podium,updated_at:revision};
  if(existing){
    const r=await db.from("ptcg_match_archive_knockouts").update(row).eq("tid",tid).eq("updated_at",existing.updated_at).select("event_id,podium,updated_at").maybeSingle();
    if(r.error)throw r.error;
    return r.data;
  }
  const r=await db.from("ptcg_match_archive_knockouts").insert(row).select("event_id,podium,updated_at").single();
  if(r.error?.code==="23505")return null;
  if(r.error)throw r.error;
  return r.data;
}
async function mappedTop8Event(tid:string){
  const [sources,tournaments]=await Promise.all([publicGitJson("data/preliminary_sources.json"),publicGitJson("data/tournaments.json")]);
  const linked=(sources.sources||[]).find((x:any)=>String(x.tid)===tid&&x.league==="Ultra"&&x.group==="Junior");
  if(!linked)return "";
  const official=(tournaments.events||[]).some((x:any)=>String(x.event_id)===String(linked.event_id)&&x.league==="Ultra"&&x.group==="Junior");
  return official?String(linked.event_id):"";
}
async function syncReadyTop8(tid:string){
  const r=await db.from("ptcg_match_archive_knockouts").select("event_id,podium,updated_at").eq("tid",tid).maybeSingle();
  if(r.error)throw r.error;
  let row=r.data;const bracket=row?.podium?.bracket;
  if(!row||!bracket?.sync_pending||bracket.conflict||!BRACKET_KEYS.every(k=>Boolean(bracket.winners?.[k]))||row.podium?.results?.length!==8)return {sync_triggered:false};
  const eventId=await mappedTop8Event(tid);
  if(!eventId)return {sync_triggered:false,sync_waiting:true};
  if(!row.event_id.startsWith("pending:")&&row.event_id!==eventId)throw new Error("賽事對應不一致");
  const published=await publicGitJson("data/knockout_results.json");
  const comparable=(rows:any[])=>JSON.stringify((rows||[]).map(x=>[x.player_id,x.preliminary_rank,x.final_rank,x.points]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const already=comparable(published.events?.[eventId]?.results)===comparable(row.podium.results);
  if(already){
    await writeKnockout(tid,eventId,{...row.podium,bracket:{...bracket,sync_pending:false}},row);
    return {sync_triggered:true,sync_published:true};
  }
  if(bracket.last_dispatch_at&&Date.now()-Date.parse(bracket.last_dispatch_at)<10*60000)return {sync_triggered:true};
  // CAS claims the dispatch; a concurrent edit or another cron cannot reuse this version.
  row=await writeKnockout(tid,eventId,{...row.podium,bracket:{...bracket,last_dispatch_at:now()}},row);
  if(!row)return {sync_triggered:false,sync_waiting:true};
  const {data,error}=await db.rpc("get_ptcg_github_trigger_config_for_service");
  if(error)throw error;
  const response=await fetch(URL_BASE+"/functions/v1/ptcg-github-trigger",{method:"POST",headers:{"Content-Type":"application/json","x-ptcg-cron-secret":String(data?.cron_secret||"")},body:JSON.stringify({workflow:"sync-knockout-results.yml",event_id:eventId}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error("同步啟動失敗 HTTP "+response.status);
  return {sync_triggered:true};
}
async function retryTop8Sync(){
  const {data,error}=await db.from("ptcg_match_archive_knockouts").select("tid").eq("podium->bracket->>sync_pending","true").limit(10);
  if(error)throw error;
  for(const row of data||[])try{await syncReadyTop8(row.tid);}catch(e){console.warn("top8-sync-retry",row.tid,String(e).slice(0,120));}
}
async function saveKnockoutBracket(body:any,userId:string) {
  const tid=String(body?.tid||"");
  if(!validTid(tid))throw new Error("賽事識別碼不正確");
  const admin=await memberEvent(userId,tid);
  const incoming=cleanWinners(body.winners),base=body.base_winners?cleanWinners(body.base_winners):null;
  const state=await currentKnockout(tid);
  if(!state.event?.final_seen_at||!isJuniorUltra(String(state.event.title||"")))throw new Error("這場尚未確認高級球孩童組的預賽最終排名");
  const top=verifiedTop(state.final);
  if(invalidWinners(top,incoming).length)throw new Error("勝者與前一輪對戰結果不相符");
  for(let attempt=0;attempt<5;attempt++){
    const existing=(await currentKnockout(tid)).knockout;
    const oldPodium=existing?.podium||{}, old=oldPodium.bracket||{};
    const stored=cleanWinners(old.winners||{});
    let winners=incoming,conflict=old.conflict||null;
    const resolving=String(body.resolve_conflict||"");
    if(conflict){
      if(!admin||!["keep","adopt"].includes(resolving)||body.conflict_id!==conflict.id)throw new Error("目前有複賽戰況衝突，請由管理者裁決後再登記");
      winners=resolving==="adopt"?cleanWinners(conflict.incoming):stored;
      conflict=null;
    }else{
      if(resolving)throw new Error("衝突已由其他裝置處理，請重新讀取");
      // Old cached clients cannot overwrite a saved bracket without a base snapshot.
      const previous=base||cleanWinners({});
      const merged=mergeBracket(top,previous,stored,incoming);
      if(merged.conflicts.length)conflict={id:crypto.randomUUID(),games:merged.conflicts,incoming,stored,reported_by:userId,reported_at:now()};
      else winners=merged.winners;
      if(conflict)winners=stored;
    }
    const complete=BRACKET_KEYS.every(k=>Boolean(winners[k]));
    const podium:any={...oldPodium,bracket:{version:2,winners,updated_at:now(),updated_by:userId,conflict,sync_pending:complete&&!conflict}};
    // Preserve every submission (including conflicting proposals and resolutions).
    podium.bracket.audit=[...(Array.isArray(old.audit)?old.audit:[]),{by:userId,at:now(),base,incoming,resolve:resolving||null,conflict:conflict?.id||null}];
    if(complete&&!conflict){
      const participants=bracketParticipants(top,winners);
      const semiLosers=[...participants.sf1,...participants.sf2].filter(id=>id!==winners.sf1&&id!==winners.sf2);
      const results=top.map((p:any)=>{
        const id=String(p.id).toLowerCase(),finalRank=id===winners.final?1:participants.final.includes(id)?2:semiLosers.includes(id)?3:5;
        return {player_id:id,preliminary_rank:p.rank,final_rank:finalRank,finish:({1:"冠軍",2:"亞軍",3:"四強",5:"八強"} as Record<number,string>)[finalRank],points:({1:100,2:75,3:50,5:25} as Record<number,number>)[finalRank]};
      });
      if(results.reduce((sum:number,r:any)=>sum+r.points,0)!==375||results.filter((r:any)=>r.final_rank===3).length!==2||results.filter((r:any)=>r.final_rank===5).length!==4)throw new Error("對戰結果與名次積分驗證失敗");
      podium.results=results;
    }
    const saved=await writeKnockout(tid,existing?.event_id||"pending:"+tid,podium,existing);
    if(!saved)continue;
    let sync:any={sync_triggered:false};
    if(complete&&!conflict)try{sync=await syncReadyTop8(tid);}catch(e){sync={sync_triggered:false,sync_waiting:true,sync_error:String(e).slice(0,140)};}
    return {ok:true,saved:true,tid,event_id:saved.event_id,confirmed:BRACKET_KEYS.filter(k=>winners[k]).length,complete:complete&&!conflict,winners,conflict:conflict?{id:conflict.id,games:conflict.games,stored:conflict.stored,incoming:conflict.incoming}:null,...sync};
  }
  throw new Error("其他裝置正在儲存，請重新讀取後再試");
}

async function saveKnockout(body:any) {
  const tid=String(body?.tid||""),eventId=String(body?.event_id||"");
  if(!validTid(tid)||!/^[0-9]{1,12}$/.test(eventId))throw new Error("賽事識別碼不正確");
  const champion=String(body?.champion||"").toLowerCase();
  const runner=String(body?.runner_up||"").toLowerCase();
  const semis=Array.isArray(body?.semifinalists)?body.semifinalists.map((id:any)=>String(id||"").toLowerCase()):[];
  if(semis.length!==2)throw new Error("請指定兩位四強選手");
  const chosen=[champion,runner,...semis];
  if(chosen.some(id=>!/^tw[0-9]{6,12}$/.test(id))||new Set(chosen).size!==4)
    throw new Error("冠軍、亞軍、兩位四強必須是四位不同的選手");
  const archive=await db.from("ptcg_match_archives")
    .select("tid,status,final_seen_at").eq("tid",tid).maybeSingle();
  if(archive.error)throw archive.error;
  if(!archive.data?.final_seen_at||archive.data.status!=="completed")
    throw new Error("這場還沒完成最終排名封存");
  const final=await db.from("ptcg_match_archive_finals")
    .select("player_count,standings").eq("tid",tid).maybeSingle();
  if(final.error)throw final.error;
  const all=final.data?.standings;
  if(!Array.isArray(all)||all.length<9||Number(final.data?.player_count)!==all.length)
    throw new Error("最終排名不完整");
  const top=all.filter((p:any)=>Number.isInteger(p.rank)&&p.rank>=1&&p.rank<=8);
  const map=new Map(top.map((p:any)=>[String(p.id||"").toLowerCase(),Number(p.rank)]));
  if(top.length!==8||map.size!==8||new Set(top.map((p:any)=>p.rank)).size!==8
      ||chosen.some(id=>!map.has(id)))throw new Error("設定的選手必須出自本場預賽前八名");
  const [sources,tournaments]=await Promise.all([
    publicGitJson("data/preliminary_sources.json"),publicGitJson("data/tournaments.json")
  ]);
  const source=(sources.sources||[]).find((x:any)=>
    String(x.event_id)===eventId&&String(x.tid)===tid
    &&x.league==="Ultra"&&x.group==="Junior");
  const official=(tournaments.events||[]).find((x:any)=>String(x.event_id)===eventId
    &&x.league==="Ultra"&&x.group==="Junior");
  if(!source||!official)throw new Error("這場尚未完成高級球試算來源對應，稍後再儲存");
  const results=top.map((p:any)=>{
    const id=String(p.id).toLowerCase();
    const finish=id===champion?"冠軍":id===runner?"亞軍":semis.includes(id)?"四強":"八強";
    const rank=finish==="冠軍"?1:finish==="亞軍"?2:finish==="四強"?3:5;
    const points=rank===1?100:rank===2?75:rank===3?50:25;
    return {player_id:id,preliminary_rank:p.rank,final_rank:rank,finish,points};
  });
  if(results.length!==8||results.reduce((sum:number,p:any)=>sum+p.points,0)!==375)
    throw new Error("名次與 LP 加總驗證失敗");
  // 舊版「直接設定名次」不能覆蓋已記錄的逐場對戰樹。
  const existing=await db.from("ptcg_match_archive_knockouts")
    .select("podium,event_id,updated_at").eq("tid",tid).maybeSingle();
  if(existing.error)throw existing.error;
  const oldPodium=existing.data?.podium&&typeof existing.data.podium==="object"
    ? existing.data.podium:{};
  if(oldPodium?.bracket)
    throw new Error("這場已使用對戰樹記錄勝負，請在 TOP8 對戰樹更新結果");
  const write=await writeKnockout(tid,eventId,{...oldPodium,results},existing.data);
  if(!write)throw new Error("複賽紀錄已變更，請重新讀取");
  // The saved private record is the source of truth. GitHub sync only receives
  // public IDs and scores, never the account's identity or recorded decks.
  let syncError="";
  try{
    const {data,error}=await db.rpc("get_ptcg_github_trigger_config_for_service");
    if(error)throw error;
    const secret=String(data?.cron_secret||"");
    const response=await fetch(URL_BASE+"/functions/v1/ptcg-github-trigger",{
      method:"POST",headers:{"Content-Type":"application/json","x-ptcg-cron-secret":secret},
      body:JSON.stringify({workflow:"sync-knockout-results.yml",event_id:eventId}),
      signal:AbortSignal.timeout(18000)});
    if(!response.ok)throw new Error("同步啟動失敗 HTTP "+response.status);
  }catch(e){syncError=String((e as Error).message||e).slice(0,140);}
  return {ok:true,saved:true,tid,event_id:eventId,
    sync_triggered:!syncError,...(syncError?{sync_error:syncError}:{})};
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
      const ttlParsed=parseMatchRows([
        ["Table","No.","Your name","TtlScore","Opponent","TtlScore"],
        ["601","901","tw11111111","6","tw22222222","3"],
        ["602","902","tw33333333","0","tw44444444","0"]
      ]);
      if(ttlParsed.matches[0]?.a?.record?.points!==6
        || ttlParsed.matches[0]?.b?.record?.points!==3
        || ttlParsed.matches[1]?.a?.record?.points!==0
        || ttlParsed.matches[1]?.b?.record?.points!==0)
        throw new Error("TtlScore parser selftest failed");
      const finalScoreTest=standingsFromRows([
        ["Rank","Name","TtlScore"],["1","tw82928313","18"],["2","tw61881775","15"]
      ]);
      if(finalScoreTest.length!==2||finalScoreTest[0].points!==18||finalScoreTest[1].points!==15)
        throw new Error("final standings TtlScore parser selftest failed");
      const parsed=parseMatchRows(example);
      if(parsed.table_count!==2 || parsed.player_count!==3
        || parsed.matches[0]?.a?.name!=="王品澤"
        || parsed.matches.at(-1)?.kind!=="bye")
        throw new Error("archive parser selftest failed");
      return json({ok:true,tables:parsed.table_count,players:parsed.player_count,
        bye:parsed.matches.at(-1)?.kind==="bye",ttl_score_test:true,final_ttl_score_test:true});
    }
    if(action==="repair-final-scores") {
      await requireCron(req);
      return json(await repairFinalScores(String(body?.tid||"")));
    }
    if(action==="poll") {
      await requireCron(req);
      const results=await pollAll();
      try{await retryTop8Sync();}catch(e){console.warn("top8-sync",String(e).slice(0,120));}
      return json({ok:true,...results});
    }
    if(action==="top8-history") {const member=await requireMember(req,true);return json(await liveKnockout(body,member.id,true));}
    if(action==="top8-live") {const member=await requireMember(req,true);return json(await liveKnockout(body,member.id));}
    if(action==="save-knockout-bracket") {const member=await requireMember(req,true);return json(await saveKnockoutBracket(body,member.id));}
    if(action==="register-tracked") {const member=await requireMember(req,true);const tid=sourceTid(String(body?.url||""));const watch=await db.from("pairing_watches").select("source_url").eq("user_id",member.id).eq("tid",tid).maybeSingle();if(watch.error||!watch.data)throw new Error("只能封存自己的追蹤賽事");await insertArchive(tid,watch.data.source_url);return json({ok:true,tid});}
    if(action==="scout-roster") {await requireMember(req,true);return json(await scoutRoster(String(body?.tid||""),Number(body?.round)));}
    // History reads have their own narrow member authorization; all archive management remains admin-only.
    if(action==="list"||action==="get") {
      const reader=await requireMember(req,true);
      const {data:admin,error}=await db.rpc("is_pairing_authorized",{target_user:reader.id});
      if(error)throw error;
      if(action==="list"){
        const archives=await listArchives();
        return json({ok:true,archives:admin===true?archives:archives.map(({last_error,...safe})=>safe)});
      }
      const archive=await readArchive(String(body?.tid||""),body?.round==null?undefined:Number(body.round),reader.id);
      if(archive&&admin!==true){
        const {last_error,...event}=archive.event;archive.event=event;
        const bracket=archive.knockout?.podium?.bracket;
        if(bracket){delete bracket.audit;delete bracket.updated_by;if(bracket.conflict)delete bracket.conflict.reported_by;}
      }
      return json({ok:true,archive});
    }
    const member=await requireMember(req);
    if(action==="register") {
      const tid=sourceTid(String(body?.url||""));
      await insertArchive(tid,String(body?.url||""));
      return json({ok:true,tid});
    }
    if(action==="configure-rounds") {
      const tid=String(body?.tid||"");
      const expected=Number(body?.expected_rounds);
      if(!validTid(tid)||!Number.isInteger(expected)||expected<1||expected>40)
        throw new Error("請確認賽事 TID 與正確總輪數（1–40）");
      const event=await db.from("ptcg_match_archives")
        .select("tid,status,final_seen_at,expected_rounds").eq("tid",tid).maybeSingle();
      if(event.error)throw event.error;
      if(!event.data)throw new Error("請先啟動這場賽事的封存");
      if(event.data.final_seen_at || event.data.status==="completed")
        throw new Error("這場賽事已完成封存，總輪數不能再更動");
      const upd=await db.from("ptcg_match_archives").update({
        expected_rounds:expected,updated_at:now(),poll_until:addMinutes(3*24*60)
      }).eq("tid",tid).select("tid,expected_rounds").single();
      if(upd.error)throw upd.error;
      return json({ok:true,...upd.data});
    }

    if(action==="save-knockout")return json(await saveKnockout(body));


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
