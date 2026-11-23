import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OWNER = "guoer11";
const REPO = "ptcg-ranking";
const ALLOWED_WORKFLOWS = new Set(["update-tournaments.yml", "update-ranking.yml", "sync-preliminary.yml", "sync-knockout-results.yml"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}


type PairingFinalWatch = {
  tid: string;
  player_id: string;
  source_url?: string | null;
  last_checked_at: string | null;
  final_notified: boolean;
  final_result: {rank?:number|string;player?:string} | null;
};
const TAIPEI_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
});
function taipeiDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(TAIPEI_DATE.formatToParts(d)
    .filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join("-");
}
async function githubPublicData(path: string): Promise<any> {
  const url = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/main/" + path;
  const response = await fetch(url, {headers: {"Accept": "application/json"}, signal: AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error("GitHub " + path + " HTTP " + response.status);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error("GitHub data too large");
  return JSON.parse(text);
}
// Only public TIDs leave the backend. Private users and scout data never do.
type PreliminarySource = {event_id:string;tid:string;standings?:[string,number][];
  source_url?:string;source_status?:string;expected_rounds?:number};
async function discoverFinishedEvents(): Promise<PreliminarySource[]> {
  const {data: watches, error} = await service.from("pairing_watches")
    .select("tid,player_id,source_url,last_checked_at,final_notified,final_result")
    .eq("final_notified", true)
    .order("last_checked_at", {ascending:false})
    .limit(200);
  if (error) throw error;
  const [rankings, tournaments, saved, published] = await Promise.all([
    githubPublicData("data/ranking.json"),
    githubPublicData("data/tournaments.json"),
    githubPublicData("data/preliminary_sources.json"),
    githubPublicData("data/preliminary_results.json")
  ]);
  const groupById = new Map<string, Set<string>>();
  for (const [group, players] of Object.entries(rankings?.groups || {})) {
    if (!Array.isArray(players)) continue;
    for (const player of players as any[]) {
      const id = String(player.player_id || "").toLowerCase();
      if (!id) continue;
      if (!groupById.has(id)) groupById.set(id, new Set());
      groupById.get(id)!.add(group);
    }
  }
  const existing = Array.isArray(saved?.sources) ? saved.sources : [];
  const output = new Map<string,PreliminarySource>();
  const registeredEvents = new Set(existing.map((x:any)=>String(x.event_id)));
  const registeredTids = new Set(existing.map((x:any)=>String(x.tid)));
  const allEvents = Array.isArray(tournaments?.events) ? tournaments.events : [];
  for (const watch of (watches || []) as PairingFinalWatch[]) {
    const tid = String(watch.tid || "");
    const id = String(watch.player_id || "").toLowerCase();
    if (!/^\d{1,12}$/.test(tid) || tid === "3000442" || !/^tw\d{6,12}$/.test(id)
        || registeredTids.has(tid) || !watch.last_checked_at || !watch.final_notified
        || !(Number(watch.final_result?.rank) > 0)
        || (watch.final_result?.player && String(watch.final_result.player).toLowerCase() !== id)) continue;
    try {
      const official = new URL(String(watch.source_url || ""));
      if (official.hostname !== "tcg.sfc-jpn.jp"
          || official.searchParams.get("tid") !== tid) continue;
    } catch { continue; }
    const groups = groupById.get(id);
    if (!groups || groups.size !== 1 || !groups.has("Junior")) continue;
    const endDate = taipeiDate(watch.last_checked_at);
    if (!endDate) continue;
    // Premier Ball may span Day 1 / Day 2. A Day 1 standings page is not
    // sufficient evidence of an overall final result, so require a Day 2 finish.
    const finishedAt = new Date(endDate + "T00:00:00Z").getTime();
    const previousDay = new Date(finishedAt - 86400000).toISOString().slice(0, 10);
    const twoDaysEarlier = new Date(finishedAt - 2 * 86400000).toISOString().slice(0, 10);
    const possible = allEvents.filter((event:any) =>
      (event.league === "Ultra" ? event.date === endDate
        : event.league === "Premier" ? [previousDay, twoDaysEarlier].includes(event.date)
        : false) && event.group === "Junior"
      && ["Ultra","Premier"].includes(event.league)
      && /^\d{1,12}$/.test(String(event.event_id || ""))
      && !(Array.isArray(event.results) && event.results.length)
      && !/waiting\s*list|waitlist|候補|候补|備取|备取/i.test(String(event.title || ""))
      && !registeredEvents.has(String(event.event_id)));
    // More than one event on the same date: do not guess.
    if (possible.length !== 1) continue;
    const event_id = String(possible[0].event_id);
    if (output.has(event_id)) {
      output.delete(event_id);
      registeredEvents.add(event_id);
      continue;
    }
    output.set(event_id, {event_id, tid});
  }
  // Completed full-event archives are authoritative for automatic preliminary
  // LP projections. Unlike the live watch, they survive official web closure.
  // We publish only public PTCG IDs and ranks; no user IDs, decks or names.
  const {data:archives,error:archiveError}=await service.from("ptcg_match_archives")
    .select("tid,title,expected_rounds,final_seen_at,status")
    .eq("status","completed").not("final_seen_at","is",null)
    .order("final_seen_at",{ascending:false}).limit(150);
  if(archiveError)throw archiveError;
  const validArchives=(archives||[]).filter(a =>
    /^\d{1,12}$/.test(String(a.tid))
    && /(孩童|Junior)/i.test(String(a.title))
    && /(UBL|高級球|Ultra)/i.test(String(a.title))
    && /20\d{2}\/\d{1,2}\/\d{1,2}/.test(String(a.title)));
  if(validArchives.length) {
    const tids=validArchives.map(a=>String(a.tid));
    const {data:finals,error:finalError}=await service.from("ptcg_match_archive_finals")
      .select("tid,source_url,source_status,player_count,standings")
      .in("tid",tids);
    if(finalError)throw finalError;
    const finalsByTid=new Map((finals||[]).map(f=>[String(f.tid),f]));
    const existingByEvent=new Map(existing.map((x:any)=>[String(x.event_id),String(x.tid)]));
    const imported=published?.events||{};
    for(const archive of validArchives) {
      const tid=String(archive.tid),raw=finalsByTid.get(tid);
      if(!raw||!["official_final","completed_last_round"].includes(raw.source_status))continue;
      const dateParts=String(archive.title).match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
      if(!dateParts)continue;
      const date=[dateParts[1],dateParts[2].padStart(2,"0"),dateParts[3].padStart(2,"0")].join("-");
      const possible=allEvents.filter((e:any)=>
        e.date===date && e.group==="Junior" && e.league==="Ultra"
        && /^\d{1,12}$/.test(String(e.event_id||""))
        && !(Array.isArray(e.results)&&e.results.length)
        && !/waiting\s*list|waitlist|候補|備取/i.test(String(e.title||"")));
      if(possible.length!==1)continue; // Never match a TID to an ambiguous event.
      const event_id=String(possible[0].event_id);
      if((existingByEvent.has(event_id)&&existingByEvent.get(event_id)!==tid)
          || existing.some((x:any)=>String(x.tid)===tid&&String(x.event_id)!==event_id))continue;
      const previous=output.get(event_id);
      if(previous && previous.tid!==tid)continue;
      const url=new URL(String(raw.source_url));
      if(url.protocol!=="https:"||url.hostname!=="tcg.sfc-jpn.jp"
          || url.pathname!=="/tourround.asp"||url.searchParams.get("tid")!==tid
          || url.searchParams.get("znt")!=="1")continue;
      const expected=Number(archive.expected_rounds)||null;
      if(raw.source_status==="official_final" && url.searchParams.get("kno")!=="9999999")continue;
      if(raw.source_status==="completed_last_round"
          && (!Number.isInteger(expected)||expected<1||expected>40
            ||url.searchParams.get("kno")!==String(expected)))continue;
      const records=raw.standings;
      if(!Array.isArray(records)||records.length<9||records.length>1024
          ||Number(raw.player_count)!==records.length)continue;
      const ids=new Set<string>(),ranks=new Set<number>();
      const compact:[string,number][]=[];
      let valid=true;
      for(const item of records) {
        const id=String(item.id||"").toLowerCase(),rank=Number(item.rank);
        if(!/^tw\d{6,12}$/.test(id)||!Number.isInteger(rank)||rank<1||rank>records.length
            ||ids.has(id)||ranks.has(rank)){valid=false;break;}
        ids.add(id);ranks.add(rank);compact.push([id,rank]);
      }
      if(!valid||ranks.size!==records.length)continue;
      compact.sort((a,b)=>a[1]-b[1]);
      const prior=imported?.[event_id];
      if(prior?.tid===tid && Array.isArray(prior.standings)
          && prior.standings.length===compact.length
          && compact.every((item,i)=>String(prior.standings[i]?.player_id)===item[0]
            && Number(prior.standings[i]?.rank)===item[1]))continue;
      output.set(event_id,{
        event_id,tid,source_url:url.toString(),source_status:raw.source_status,
        ...(expected?{expected_rounds:expected}:{}),standings:compact
      });
    }
  }
  // GitHub workflow_dispatch has a 65,535-char input limit. Prioritize the
  // archived results, then legacy watched matches. Remaining events are
  // retried by the existing daily cron, never silently truncated as scores.
  const candidates=[...output.values()].sort((a,b)=>Number(Boolean(b.standings))-Number(Boolean(a.standings)));
  const selected:PreliminarySource[]=[];
  for(const item of candidates) {
    if(selected.length>=25)break;
    if(JSON.stringify(selected.concat(item)).length>54000)continue;
    selected.push(item);
  }
  return selected;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { data: config, error } = await service.rpc("get_ptcg_github_trigger_config_for_service");
    if (error) throw error;

    const expectedSecret = String(config?.cron_secret || "");
    const suppliedSecret = String(req.headers.get("x-ptcg-cron-secret") || "");
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return json({ error: "unauthorized" }, 401);
    }

    const githubToken = String(Deno.env.get("PTCG_GITHUB_ACTIONS_TOKEN") || "").trim();
    if (!githubToken) {
      return json({ error: "github token not configured" }, 503);
    }

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const workflow = String(body?.workflow || "update-tournaments.yml");
    if (!ALLOWED_WORKFLOWS.has(workflow)) {
      return json({ error: "workflow not allowed" }, 400);
    }

    const sources = workflow === "sync-preliminary.yml" ? await discoverFinishedEvents() : [];
    let knockoutPayload: null | Record<string, unknown> = null;
    if(workflow === "sync-knockout-results.yml") {
      const eventId=String(body?.event_id||"");
      if(!/^[0-9]{1,12}$/.test(eventId))return json({error:"invalid event ID"},400);
      const {data:verified,error:verifiedError}=await service
        .from("ptcg_match_archive_knockouts")
        .select("tid,event_id,podium").eq("event_id",eventId).maybeSingle();
      if(verifiedError)throw verifiedError;
      if(!verified?.tid||!Array.isArray(verified.podium?.results)||verified.podium.results.length!==8)
        return json({error:"verified Top 8 not found"},404);
      const {data:archived,error:archivedError}=await service
        .from("ptcg_match_archive_finals").select("source_url,standings")
        .eq("tid",String(verified.tid)).maybeSingle();
      if(archivedError)throw archivedError;
      if(!archived?.source_url||!Array.isArray(archived.standings)||archived.standings.length<9)
        return json({error:"completed archive not found"},404);
      // Only public player IDs and results leave Supabase. No private names or scout data.
      knockoutPayload={event_id:String(verified.event_id),tid:String(verified.tid),
        source_url:String(archived.source_url),results:verified.podium.results};
    }
    if (body?.dry_run === true) {
      return json({ok:true,dry_run:true,workflow,new_mapping_count:sources.length,
        mappings:sources,knockout_ready:Boolean(knockoutPayload)});
    }
    const dispatchBody = workflow === "sync-preliminary.yml"
      ? {ref:"main",inputs:{auto_sources:JSON.stringify(sources)}}
      : workflow === "sync-knockout-results.yml"
        ? {ref:"main",inputs:{payload:JSON.stringify(knockoutPayload)}}
        : {ref:"main"};
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "ptcg-ranking-supabase-cron",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dispatchBody),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return json({ error: `GitHub HTTP ${response.status}`, detail }, 502);
    }

    return json({ ok: true, triggered: true, workflow, new_mapping_count: sources.length });
  } catch (error: any) {
    console.error(error);
    return json({ error: String(error?.message || error) }, 500);
  }
});
