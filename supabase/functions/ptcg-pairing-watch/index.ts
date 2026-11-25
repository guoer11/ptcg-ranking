import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendNotification } from "npm:web-push-neo@0.1.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = (Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "").trim();
const LINE_USER_ID = (Deno.env.get("LINE_USER_ID") || "").trim();
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE_URL = "https://guoer11.github.io/ptcg-ranking/pairing.html";
const PAIRING_URL = `${SUPABASE_URL}/functions/v1/ptcg-pairing`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://guoer11.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function requireUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("missing authorization");
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) throw new Error("unauthorized");
  const { data: allowed, error: allowError } = await service.rpc("is_pairing_member", { target_user: data.user.id });
  if (allowError || !allowed) throw new Error("unauthorized");
  return data.user;
}

function parseRoundUrl(input: string) {
  const url = new URL(input);
  if (url.hostname !== "tcg.sfc-jpn.jp" || !/\/tourround\.asp$/i.test(url.pathname)) throw new Error("請貼 tcg.sfc-jpn.jp 的 tourround.asp 網址");
  const tid = url.searchParams.get("tid") || "";
  const round = Number(url.searchParams.get("kno") || 0);
  if (!/^\d+$/.test(tid) || !Number.isInteger(round) || round < 1) throw new Error("網址缺少有效 tid / kno");
  url.protocol = "https:";
  url.searchParams.set("znt", url.searchParams.get("znt") || "0");
  return { url, tid, round };
}

function roundUrl(source: string, round: number) {
  const parsed = parseRoundUrl(source);
  parsed.url.searchParams.set("kno", String(round));
  parsed.url.searchParams.set("znt", "0");
  return parsed.url.toString();
}

function officialRoundUrl(tid: string, round: number) {
  return `https://tcg.sfc-jpn.jp/tourround.asp?tid=${encodeURIComponent(String(tid))}&kno=${encodeURIComponent(String(round))}&znt=0`;
}

function officialFinalRankUrl(tid: string) {
  return `https://tcg.sfc-jpn.jp/tourround.asp?tid=${encodeURIComponent(String(tid))}&kno=9999999&znt=1`;
}

function finalRankUrl(source: string) {
  const parsed = parseRoundUrl(source);
  parsed.url.searchParams.set("kno", "9999999");
  parsed.url.searchParams.set("znt", "1");
  return parsed.url.toString();
}

async function fetchPairing(sourceUrl: string, playerId: string | string[]) {
  const response = await fetch(PAIRING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Array.isArray(playerId) ? { url: sourceUrl, players: playerId } : { url: sourceUrl, player: playerId }),
    signal:AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `配對讀取失敗 HTTP ${response.status}`);
  return data;
}

// TCG Meister may publish "End of Round N interim result" before the
// separate final standings URL becomes available. Show it as provisional,
// but never send a FINAL notification or stop the live watcher for it.
async function readCurrentRank(source:string,playerId:string | string[]) {
  const official=await fetchPairing(finalRankUrl(source),playerId);
  if(official.available && official.is_final)return official;
  const parsed=parseRoundUrl(source);
  const links:string[]=[];
  if(parsed.url.searchParams.get("znt")==="1" && parsed.round!==9999999)
    links.push(parsed.url.toString());
  try {
    const main=await fetch(`https://tcg.sfc-jpn.jp/tour.asp?tid=${encodeURIComponent(parsed.tid)}`,{
      headers:{"Accept":"text/html","Cache-Control":"no-cache"},signal:AbortSignal.timeout(10000)});
    if(main.ok) {
      const html=await main.text();
      const candidates=[...html.matchAll(/href=["']([^"']*tourround\.asp\?[^"']+)["']/gi)]
        .map(m=>m[1].replace(/&amp;/gi,"&"))
        .map(raw=>{try{return new URL(raw,"https://tcg.sfc-jpn.jp/");}catch{return null;}})
        .filter((url):url is URL=>url!==null && url.hostname==="tcg.sfc-jpn.jp"
          && url.pathname.endsWith("/tourround.asp")
          && url.searchParams.get("tid")===parsed.tid
          && url.searchParams.get("znt")==="1"
          && Number(url.searchParams.get("kno"))>=1
          && Number(url.searchParams.get("kno"))<=40)
        .sort((a,b)=>Number(b.searchParams.get("kno"))-Number(a.searchParams.get("kno")));
      links.push(...candidates.map(c=>c.toString()));
    }
  }catch(err){console.warn("interim-link-discovery",String(err));}
  const {data:configured,error:roundsError}=await service.from("ptcg_match_archives")
    .select("expected_rounds").eq("tid",parsed.tid).maybeSingle();
  if(roundsError)throw roundsError;
  const expected=Number(configured?.expected_rounds)||null;
  for(const url of [...new Set(links)].slice(0,3)) {
    try {
      const result=await fetchPairing(url,playerId);
      if(!result.available || !["interim","final"].includes(result.rank_status))continue;
      if(result.rank_status==="interim" && expected!==null && result.round===expected) {
        return {...result,rank_status:"final",is_interim:false,is_final:true,
          source_status:"completed_last_round",expected_rounds:expected};
      }
      return result;
    }catch(err){console.warn("interim-rank-fetch",String(err));}
  }
  return official;
}

async function resolveName(playerId: string) {
  const id = String(playerId || "").toLowerCase();
  if (!id) return "";
  const { data } = await service.from("player_identities").select("real_name").eq("player_id", id).maybeSingle();
  return String(data?.real_name || "");
}

async function resolveDeckKnowledge(userId: string, tid: string, playerId: string) {
  const id = String(playerId || "").toLowerCase();
  if (!userId || !tid || !id) return { confirmed: "", possible: [] as string[] };

  const [{ data: exactRows }, { data: pairRows }] = await Promise.all([
    service
      .from("pairing_shared_scouts")
      .select("player_id,deck_name")
      .eq("conflict",false)
      .eq("tid", String(tid)),
    service
      .from("pairing_shared_pairs")
      .select("player_a_id,player_b_id,deck_a,deck_b")
      .eq("conflict",false)
      .eq("tid", String(tid)),
  ]);

  const exact = new Map<string, string>();
  for (const row of exactRows || []) {
    exact.set(String(row.player_id || "").toLowerCase(), String(row.deck_name || ""));
  }
  const confirmed = exact.get(id) || "";
  if (confirmed) return { confirmed, possible: [] as string[] };

  const possible = new Set<string>();
  for (const row of pairRows || []) {
    const a = String(row.player_a_id || "").toLowerCase();
    const b = String(row.player_b_id || "").toLowerCase();
    if (a !== id && b !== id) continue;
    const other = a === id ? b : a;
    const deckA = String(row.deck_a || "");
    const deckB = String(row.deck_b || "");
    const otherDeck = exact.get(other) || "";

    if (deckA && deckA === deckB) {
      possible.add(deckA);
    } else if (otherDeck && [deckA, deckB].includes(otherDeck)) {
      if (deckA && deckA !== otherDeck) possible.add(deckA);
      if (deckB && deckB !== otherDeck) possible.add(deckB);
    } else {
      if (deckA) possible.add(deckA);
      if (deckB) possible.add(deckB);
    }
  }

  return { confirmed: "", possible: [...possible] };
}

async function loadVapid() {
  const { data, error } = await service.rpc("get_push_vapid_config_for_service");
  if (error || !data?.public_key || !data?.private_key) throw new Error(error?.message || "VAPID config unavailable");
  return { subject: data.subject, publicKey: data.public_key, privateKey: data.private_key };
}

// Bounded retry: retry each rejected delivery independently; never resend successful targets.
const RETRY_DELAYS_MS = [500, 1500];
const delay = (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms));
function deliveryStatus(error:any):number {
  return Number(error?.statusCode || error?.status || error?.response?.status || 0);
}
function trace(stage:string, values:Record<string,unknown>) {
  // No names, player IDs, endpoints, secrets, or message text in logs.
  console.log(JSON.stringify({event:"pairing-monitor",stage,at:new Date().toISOString(),...values}));
}
async function retryDelivery<T>(channel:string, task:()=>Promise<T>, shouldRetry:(error:any)=>boolean) {
  const started=Date.now();
  for(let attempt=1;;attempt++){
    try{
      const value=await task();
      trace("delivery-accepted",{channel,attempt,elapsed_ms:Date.now()-started});
      return value;
    }catch(error:any){
      const status=deliveryStatus(error);
      const retry=attempt<=RETRY_DELAYS_MS.length && shouldRetry(error);
      trace(retry?"delivery-retry":"delivery-failed",{channel,attempt,status,elapsed_ms:Date.now()-started});
      if(!retry)throw error;
      await delay(RETRY_DELAYS_MS[attempt-1]);
    }
  }
}

type FamilyPayload = {title:string,body:string,url:string,tag:string};
type FamilyRoute = (ids:string[])=>FamilyPayload|null;
async function sendWebPush(userId: string, title: string, body: string, familyUrl = "", familyRoute?:FamilyRoute) {
  const [{ data: rows, error }, { data: familyRows, error:familyError }] = await Promise.all([
    service.from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId)
      .eq("notify_pairing", true),
    service.from("family_push_subscriptions")
      .select("endpoint,active,player_filter_mode,allowed_player_ids")
      .eq("owner_user_id", userId),
  ]);
  if (error) throw error;
  if (familyError) throw familyError;
  if (!rows?.length) return { sent: 0 };
  const familyEndpoints = new Map((familyRows || []).map((row: any) => [String(row.endpoint || ""),row]));
  const vapid = await loadVapid();
  let sent = 0, failed=0;
  // Each recipient starts independently, so a slow phone cannot block another.
  await Promise.all(rows.map(async (row:any) => {
    try {
      const family:any = familyEndpoints.get(String(row.endpoint || ""));
      if(family && !family.active)return;
      let payload:FamilyPayload|null = family && familyUrl
        ? { title, body, url: familyUrl, tag: "ptcg-family-pairing" }
        : { title, body, url: "/ptcg-ranking/pairing.html", tag: "ptcg-pairing" };
      if(family?.player_filter_mode==="custom"){
        payload=familyRoute?familyRoute(family.allowed_player_ids||[]):null;
        if(!payload)return;
      }
      const channel=family?"family-push":"personal-push";
      await retryDelivery(channel,()=>sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload),
        { vapidDetails: vapid, TTL: 300 },
      ),err=>{
        // Web Push has no LINE-style idempotency key. Retry explicit temporary HTTP rejection,
        // not ambiguous connection failures where the provider might already have accepted it.
        const code=deliveryStatus(err);
        return code===429 || code===503;
      });
      sent += 1;
    } catch (error: any) {
      failed++;
      const code = deliveryStatus(error);
      if (code === 404 || code === 410) {
        await Promise.allSettled([
          service.from("push_subscriptions").delete().eq("endpoint", row.endpoint).eq("user_id",userId),
          service.from("family_push_subscriptions").update({active:false}).eq("endpoint",row.endpoint).eq("owner_user_id",userId)
        ]);
      }
    }
  }));
  return { sent, failed };
}

async function sendLine(title: string, body: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_USER_ID) return { sent: false, reason: "not_configured" };
  const text = [`🔔 ${title}`, body].filter(Boolean).join("\n");
  const retryKey=crypto.randomUUID();
  return await retryDelivery("line",async()=>{
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Line-Retry-Key":retryKey },
      body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text }] }),
      signal:AbortSignal.timeout(8000),
    });
    if(response.ok || (response.status===409 && response.headers.has("x-line-accepted-request-id")))return {sent:true};
    throw Object.assign(new Error("LINE API HTTP "+response.status),{status:response.status});
  },err=>deliveryStatus(err)===0 || deliveryStatus(err)>=500);
}

async function sendBoth(userId: string, title: string, lineBody: string, pushBody = lineBody, familyUrl = "", familyRoute?:FamilyRoute) {
  const started=Date.now();
  const [member,admin]=await Promise.all([service.rpc("is_pairing_member",{target_user:userId}),service.rpc("is_pairing_authorized",{target_user:userId})]);
  if(member.error||member.data!==true)return {line:{sent:false,reason:"not_authorized"},push:{sent:0}};
  const [line, push] = await Promise.allSettled([admin.data===true&&!admin.error?sendLine(title,lineBody):Promise.resolve({sent:false,reason:"guest_web_only"}), sendWebPush(userId, title, pushBody, familyUrl, familyRoute)]);
  const result={
    line: line.status === "fulfilled" ? line.value : { sent: false, error: String(line.reason) },
    push: push.status === "fulfilled" ? push.value : { sent: 0, error: String(push.reason) },
  };
  trace("notice-delivery-summary",{elapsed_ms:Date.now()-started,line_accepted:result.line.sent,push_accepted:result.push.sent,push_failed:"failed" in result.push?result.push.failed:push.status==="rejected"?1:0});
  return result;
}

async function prepareMatch(userId:string,pairing:any) {
  const match=pairing?.match;
  if(!match)throw new Error("找不到指定玩家配對");
  return await Promise.all([resolveName(match.player),resolveName(match.opponent),resolveDeckKnowledge(userId,pairing.tid,match.opponent)]);
}
async function notifyMatch(userId: string, pairing: any, test = false, prepared?:Awaited<ReturnType<typeof prepareMatch>>) {
  const match = pairing?.match;
  if (!match) throw new Error("找不到指定玩家配對");
  const [playerName, opponentName, deckKnowledge] = prepared || await prepareMatch(userId,pairing);
  const title = `${test ? "[測試] " : ""}Round ${pairing.round} 配對已公布`;
  const playerLabel = playerName ? `${playerName} (${match.player})` : match.player;
  const opponentLabel = opponentName ? `${opponentName} (${match.opponent})` : match.opponent;
  const officialUrl = officialRoundUrl(pairing.tid, Number(pairing.round));
  const deckLine = deckKnowledge.confirmed
    ? `\n已記錄牌組：${deckKnowledge.confirmed}`
    : (deckKnowledge.possible.length ? `\n可能牌組：${deckKnowledge.possible.join(" / ")}` : "");
  const lineBody = `${playerLabel}\n桌號：${match.table}\n對手：${opponentLabel}${deckLine}\n\n官方配對：${officialUrl}`;
  const pushBody = `${playerLabel}\n桌號：${match.table}\n對手：${opponentLabel}${deckLine}\n\n我的網頁：${SITE_URL}\n官方配對：${officialUrl}`;
  const familyParams = new URLSearchParams({
    type: "round",
    round: String(pairing.round || ""),
    player: playerLabel,
    table: String(match.table || ""),
    opponent: opponentLabel,
    official: officialUrl,
  });
  if (deckKnowledge.confirmed) familyParams.set("deck", deckKnowledge.confirmed);
  else if (deckKnowledge.possible.length) familyParams.set("possible_deck", deckKnowledge.possible.join(" / "));
  const familyUrl = `/ptcg-ranking/family-notify.html?${familyParams.toString()}`;
  return {
    title,
    body: lineBody,
    push_body: pushBody,
    player_name: playerName,
    opponent_name: opponentName,
    opponent_deck: deckKnowledge.confirmed,
    opponent_possible_decks: deckKnowledge.possible,
    official_url: officialUrl,
    family_url: familyUrl,
    ...(await sendBoth(userId, title, lineBody, pushBody, familyUrl, ids=>ids.includes(String(match.player).toLowerCase())?{title,body:pushBody,url:familyUrl,tag:"ptcg-family-pairing"}:null))
  };
}

async function notifyFinalRank(userId: string, ranking: any, test = false, preparedName?:string) {
  const standing = ranking?.standing_match;
  if (!standing) throw new Error("找不到指定玩家最終排名");
  const playerName = preparedName ?? await resolveName(standing.player);
  const playerLabel = playerName ? `${playerName} (${standing.player})` : standing.player;
  const title = `${test ? "[測試] " : ""}最終排名已公布`;
  const officialUrl = String(ranking.source_url || officialFinalRankUrl(ranking.tid));
  const lineBody = `${playerLabel}\n最終排名：第 ${standing.rank} 名\n\n官方排名：${officialUrl}`;
  const pushBody = `${playerLabel}\n最終排名：第 ${standing.rank} 名\n\n我的網頁：${SITE_URL}\n官方排名：${officialUrl}`;
  const familyParams = new URLSearchParams({
    type: "final",
    player: playerLabel,
    rank: String(standing.rank || ""),
    official: officialUrl,
  });
  const familyUrl = `/ptcg-ranking/family-notify.html?${familyParams.toString()}`;
  return { title, body: lineBody, push_body: pushBody, player_name: playerName, official_url: officialUrl, family_url: familyUrl, ...(await sendBoth(userId, title, lineBody, pushBody, familyUrl, ids=>ids.includes(String(standing.player).toLowerCase())?{title,body:pushBody,url:familyUrl,tag:"ptcg-family-pairing"}:null)) };
}

async function startWatch(userId: string, sourceUrl: string, playerId: string) {
  const parsed = parseRoundUrl(sourceUrl);
  const normalizedPlayerId = String(playerId).toLowerCase();
  const currentPairing = await fetchPairing(parsed.url.toString(), normalizedPlayerId);

  if (currentPairing.available && !currentPairing.match) {
    throw new Error(`Round ${parsed.round} 已公布，但找不到指定玩家，請確認 PTCG ID 或 Round`);
  }

  const waitingRound = currentPairing.available ? parsed.round + 1 : parsed.round;
  const completedRound = currentPairing.available ? parsed.round : Math.max(parsed.round - 1, 0);
  const row = {
    user_id: userId,
    source_url: parsed.url.toString(),
    tid: parsed.tid,
    player_id: normalizedPlayerId,
    player_ids: null,
    multi_state: {},
    current_round: completedRound,
    next_round: waitingRound,
    last_notified_round: completedRound,
    active: true,
    last_match: null,
    final_notified: false,
    final_result: null,
    last_checked_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await service.from("pairing_watches").upsert(row, { onConflict: "user_id" }).select().single();
  if (error) throw error;
  return data;
}

async function stopWatch(userId: string) {
  const { data, error } = await service.from("pairing_watches").update({ active: false, updated_at: new Date().toISOString() }).eq("user_id", userId).select().maybeSingle();
  if (error) throw error;
  return data;
}

async function getStatus(userId: string) {
  const { data, error } = await service.from("pairing_watches").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}


const MAX_TRACKED_PLAYERS = 5;
function validatePlayerIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_TRACKED_PLAYERS)
    throw new Error("請輸入 2 至 5 位追蹤玩家");
  const ids = value.map(id => String(id || "").trim().toLowerCase());
  if (ids.some(id => !/^tw\d{1,16}$/.test(id)) || new Set(ids).size !== ids.length)
    throw new Error("PTCG ID 格式錯誤或重複");
  return ids;
}
function trackedIds(watch: any): string[] {
  return Array.isArray(watch?.player_ids) && watch.player_ids.length > 1
    ? watch.player_ids : [String(watch?.player_id || "")].filter(Boolean);
}
function indexedResults(batch: any): Map<string, any> {
  if (!Array.isArray(batch?.results)) throw new Error("多玩家配對服務尚未更新，未啟動追蹤");
  return new Map(batch.results.map((r: any) => [String(r.player_id), r]));
}
function shortText(value: unknown, max = 48) { return Array.from(String(value ?? "")).slice(0,max).join(""); }
function labelFor(id: string, name: string) { return name ? shortText(name,32)+" ("+id+")" : id; }
async function previousDeckFor(userId:string,tid:string,playerId:string) {
  if(!playerId)return "";
  const {data,error}=await service.from("pairing_shared_scouts").select("deck_name")
    .eq("conflict",false).eq("player_id",playerId.toLowerCase()).neq("tid",tid)
    .order("updated_at",{ascending:false}).limit(1);
  if(error){console.warn("multi-previous-deck",error.message);return "";}
  return shortText(data?.[0]?.deck_name);
}
async function multiCards(userId:string, batch:any, ids:string[], finals:Record<string,any>={}) {
  const byId=indexedResults(batch);
  return await Promise.all(ids.map(async id=>{
    const result=byId.get(id),m=result?.match;
    const name=await resolveName(id);
    const player=labelFor(id,name || m?.player_name || "");
    if(finals[id])return {player_id:id,player,rank:String(finals[id].rank),final:true};
    if(!m)return {player_id:id,player,waiting:true};
    const [opponentName,deck]=await Promise.all([
      resolveName(String(m.opponent || "")),
      resolveDeckKnowledge(userId,String(batch.tid),String(m.opponent || ""))
    ]);
    const previous=(!deck.confirmed && !deck.possible.length)
      ? await previousDeckFor(userId,String(batch.tid),String(m.opponent || "")) : "";
    return {player_id:id,player,table:String(m.table || "—"),
      opponent:labelFor(String(m.opponent||"—"),opponentName||m.opponent_name||""),
      deck:shortText(deck.confirmed),possible_deck:shortText(deck.possible.join(" / "),64),
      previous_deck:previous,ttl_score:String(m.ttl_score ?? m.player_score ?? "")};
  }));
}
function rankingFinals(batch:any,ids:string[],previous:Record<string,any>={}) {
  const byId=indexedResults(batch), finals:Record<string,any>={};
  for(const id of ids){
    if(previous[id]) finals[id]=previous[id];
    const result=byId.get(id);
    if(batch.is_final && result?.standing_match && String(result.standing_match.player).toLowerCase()===id)
      finals[id]={rank:result.standing_match.rank,player:id};
  }
  return finals;
}
function encodeCards(cards:any[]) {
  const bytes=new TextEncoder().encode(JSON.stringify(cards));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function buildMultiNotice(batch:any,cards:any[],type:"round"|"final",test=false) {
  const title=(test?"[測試] ":"")+(type==="final"?"最終排名已公布":"Round "+batch.round+" 配對已公布");
  const official=type==="final"?String(batch.source_url||officialFinalRankUrl(batch.tid)):officialRoundUrl(batch.tid,Number(batch.round));
  const text=cards.map(c=> {
    if(c.final)return c.player+"\n最終排名：第 "+c.rank+" 名";
    if(c.waiting)return c.player+"\n"+(type==="final"?"等待最終排名":"本輪尚未找到配對");
    const deck=c.deck?"\n已記錄牌組："+c.deck:c.possible_deck?"\n可能牌組："+c.possible_deck:c.previous_deck?"\n上次比賽牌組："+c.previous_deck:"";
    return c.player+"\n桌號："+c.table+"\n對手："+c.opponent+deck+(c.ttl_score!==""?"\nTtlScore："+c.ttl_score:"");
  }).join("\n\n");
  const lineBody=text+"\n\n官方"+(type==="final"?"排名":"配對")+"："+official;
  const compactPush=cards.map(c=>c.player+"｜"+(c.final?"第 "+c.rank+" 名":c.waiting?"等待公布":"桌號 "+c.table)).join("\n");
  let pushBody=text;
  const makeUrl=(items:any[])=>{
    const params=new URLSearchParams({type,round:String(batch.round||""),official,players:encodeCards(items),mv:"2190"});
    // Explicit revision parameter helps older installed clients reload the page.
    return "/ptcg-ranking/family-notify.html?"+params.toString();
  };
  let familyUrl=makeUrl(cards);
  const length=()=>new TextEncoder().encode(JSON.stringify({title,body:pushBody,url:familyUrl,tag:"ptcg-family-pairing"})).length;
  if(length()>3500)pushBody=compactPush;
  if(length()>3500)familyUrl=makeUrl(cards.map(c=>({...c,possible_deck:shortText(c.possible_deck,24),previous_deck:shortText(c.previous_deck,24),deck:shortText(c.deck,24)})));
  if(length()>3500)familyUrl=makeUrl(cards.map(c=>({...c,possible_deck:"",previous_deck:"",deck:shortText(c.deck,20),opponent:shortText(c.opponent,38)})));
  return {title,lineBody,pushBody,familyUrl};
}
async function notifyMulti(userId:string,batch:any,cards:any[],type:"round"|"final",test=false) {
  const msg=buildMultiNotice(batch,cards,type,test);
  return await sendBoth(userId,msg.title,msg.lineBody,msg.pushBody,msg.familyUrl,ids=>{
    const selected=cards.filter(c=>ids.includes(c.player_id));
    if(!selected.length||selected.every(c=>type==="final"?!c.final:c.waiting||c.final))return null;
    const part=buildMultiNotice(batch,selected,type,test);
    let url=part.familyUrl;
    // Single-player links retain the existing round lookup UI rather than the multi-card-only path.
    if(selected.length===1){
      const card=selected[0], params=new URLSearchParams({type,round:String(batch.round||""),player:card.player,player_id:card.player_id,official:type==="final"?String(batch.source_url||officialFinalRankUrl(batch.tid)):officialRoundUrl(batch.tid,Number(batch.round)),mv:"2190"});
      if(type==="final")params.set("rank",String(card.rank||""));
      else for(const field of ["table","opponent","deck","possible_deck","previous_deck","ttl_score"])if(card[field]!=null)params.set(field,String(card[field]));
      url="/ptcg-ranking/family-notify.html?"+params.toString();
    }
    return {title:part.title,body:part.pushBody,url,tag:"ptcg-family-pairing"};
  });
}
async function startMulti(userId:string,source:string,ids:string[]) {
  const parsed=parseRoundUrl(source), old=await getStatus(userId);
  const batch=await fetchPairing(parsed.url.toString(),ids);
  const results=indexedResults(batch);
  if(batch.available && ids.some(id=>!results.get(id)?.match))
    throw new Error("本輪已公布，但找不到部分追蹤玩家，請確認所有 ID 與 Round");
  const rank=await readCurrentRank(source,ids);
  if(rank.available&&rank.is_final)throw new Error("此賽事已公布正式最終排名，請使用歷史查詢");
  const same=old?.active && String(old.tid)===parsed.tid;
  if(same&&JSON.stringify(trackedIds(old))===JSON.stringify(ids))return old;
  const completed=batch.available?parsed.round:Math.max(parsed.round-1,0);
  const next=Math.max(completed+1,same?Number(old.next_round)||1:1);
  const state={finals:{},pending_round:null,pending_ids:[]};
  const {data,error}=await service.from("pairing_watches").upsert({
    user_id:userId,source_url:parsed.url.toString(),tid:parsed.tid,player_id:ids[0],player_ids:ids,multi_state:state,
    current_round:next-1,next_round:next,last_notified_round:next-1,active:true,last_match:null,
    final_notified:false,final_result:null,last_checked_at:null,updated_at:new Date().toISOString()
  },{onConflict:"user_id"}).select().single();
  if(error)throw error;
  return data;
}
// Compare-and-set progress before sending, so overlapping 5-second jobs
// cannot both notify the same Round. No private player payload in poll output.
async function claimMulti(watch:any,patch:any) {
  // A no-result heartbeat must not invalidate a concurrent successful lookup.
  const heartbeat=Object.keys(patch).length===1 && "last_checked_at" in patch;
  const {data,error}=await service.from("pairing_watches").update(heartbeat?patch:{...patch,updated_at:new Date().toISOString()})
    .eq("id",watch.id).eq("updated_at",watch.updated_at).eq("active",true).select("id").maybeSingle();
  if(error)throw error;
  return Boolean(data);
}
// Both requests begin together. A failure on either path does not block the other.
// The normal final-ranking precedence is preserved when the rank is available.
async function parallelWatchLookup(watch:any,players:string|string[]) {
  const started=Date.now();
  const timed=async(label:string,fn:()=>Promise<any>)=>{
    const begin=Date.now();
    try{return {ok:true,data:await fn(),ms:Date.now()-begin};}
    catch(_){trace("lookup-error",{watch_id:watch.id,round:watch.next_round,source:label,elapsed_ms:Date.now()-begin});return {ok:false,data:null,ms:Date.now()-begin};}
  };
  type LookupResult={ok:boolean,data:any,ms:number};
  let rankResult:LookupResult|undefined;
  const rankPromise=(watch.final_notified?Promise.resolve({ok:true,data:null,ms:0}):timed("rank",()=>readCurrentRank(watch.source_url,players))).then(r=>{rankResult=r;return r;});
  const pairingPromise=timed("round",()=>fetchPairing(roundUrl(watch.source_url,Number(watch.next_round)),players));
  const pairing=await pairingPromise;
  const found=Boolean(pairing.data?.available&&(pairing.data?.match||pairing.data?.results?.some((r:any)=>r.match)));
  // If a confirmed pairing is ready, give final results a short grace period,
  // then send the round without waiting for slower interim-ranking discovery.
  // Any deferred final result is checked again on the next scheduled poll.
  const rank=rankResult || (found?await Promise.race([rankPromise,delay(250).then(()=>rankResult)]):await rankPromise);
  const final=Boolean(rank?.data?.available&&rank.data?.is_final);
  if(found||final||!rank?.ok||!pairing.ok||Date.now()-started>=3000)trace("lookup-finished",{watch_id:watch.id,round:watch.next_round,rank_ms:rank?.ms??null,rank_deferred:!rank,round_ms:pairing.ms,elapsed_ms:Date.now()-started,found,final,rank_ok:rank?.ok??null,round_ok:pairing.ok});
  if(rank&&!rank.ok&&!pairing.ok)throw new Error("配對與排名查詢均失敗，下一次排程重試");
  return {rank:rank?.data||{results:[]},batch:pairing.data||{results:[]}};
}
async function pollMulti(watch:any) {
  const ids=validatePlayerIds(trackedIds(watch)),now=new Date().toISOString();
  const state=watch.multi_state||{}, oldFinals=state.finals||{};
  const {rank,batch}=await parallelWatchLookup(watch,ids);
  const finals=rankingFinals(rank,ids,oldFinals);
  const remaining=ids.filter(id=>!finals[id]);
  if(ids.some(id=>finals[id]&&!oldFinals[id])){
    const detected=Date.now();
    const cards=await multiCards(watch.user_id,rank,ids,finals);
    trace("notice-prepared",{watch_id:watch.id,round:watch.next_round,type:"final",elapsed_ms:Date.now()-detected});
    const claimed=await claimMulti(watch,{multi_state:{...state,finals},active:remaining.length>0,
      final_notified:remaining.length===0,final_result:finals[ids[0]]||null,last_checked_at:now});
    if(!claimed)return {id:watch.id,skipped:true};
    const notice=await notifyMulti(watch.user_id,rank,cards,"final");
    trace("notice-finished",{watch_id:watch.id,round:watch.next_round,type:"final",elapsed_ms:Date.now()-detected,line_accepted:notice.line.sent,push_accepted:notice.push.sent});
    return {id:watch.id,final_count:ids.length-remaining.length,line_sent:notice.line.sent,push_sent:notice.push.sent};
  }
  if(!remaining.length){await claimMulti(watch,{active:false,final_notified:true,last_checked_at:now});return {id:watch.id,completed:true};}
  const next=Number(watch.next_round);
  const byId=indexedResults(batch);
  if(batch.available && remaining.some(id=>byId.get(id)?.match)){
    const detected=Date.now();
    const cards=await multiCards(watch.user_id,batch,ids,finals);
    trace("notice-prepared",{watch_id:watch.id,round:next,type:"round",elapsed_ms:Date.now()-detected});
    const missing=remaining.filter(id=>!byId.get(id)?.match);
    const claimed=await claimMulti(watch,{current_round:next,next_round:next+1,last_notified_round:next,
      last_match:byId.get(ids[0])?.match||null,
      multi_state:{...state,finals,pending_round:missing.length?next:null,pending_ids:missing},last_checked_at:now});
    if(!claimed)return {id:watch.id,skipped:true};
    const notice=await notifyMulti(watch.user_id,batch,cards,"round");
    trace("notice-finished",{watch_id:watch.id,round:next,type:"round",elapsed_ms:Date.now()-detected,line_accepted:notice.line.sent,push_accepted:notice.push.sent});
    return {id:watch.id,round:next,matched_count:remaining.length-missing.length,line_sent:notice.line.sent,push_sent:notice.push.sent};
  }
  // An individual player may appear slightly after others. Supplement the last
  // notification only when a previously missing player actually becomes visible.
  const pending=Array.isArray(state.pending_ids)?state.pending_ids.filter((id:string)=>remaining.includes(id)):[];
  if(pending.length&&Number(state.pending_round)===next-1){
    const prior=await fetchPairing(roundUrl(watch.source_url,next-1),ids);
    const previous=indexedResults(prior);
    const missing=pending.filter((id:string)=>!previous.get(id)?.match);
    if(missing.length<pending.length){
      const detected=Date.now();
      const cards=await multiCards(watch.user_id,prior,ids,finals);
      trace("notice-prepared",{watch_id:watch.id,round:next-1,type:"supplement",elapsed_ms:Date.now()-detected});
      if(await claimMulti(watch,{multi_state:{...state,finals,pending_round:missing.length?next-1:null,pending_ids:missing},last_checked_at:now})){
        const notice=await notifyMulti(watch.user_id,prior,cards,"round");
        trace("notice-finished",{watch_id:watch.id,round:next-1,type:"supplement",elapsed_ms:Date.now()-detected,line_accepted:notice.line.sent,push_accepted:notice.push.sent});
        return {id:watch.id,round:next-1,supplement:true,line_sent:notice.line.sent,push_sent:notice.push.sent};
      }
      return {id:watch.id,skipped:true};
    }
  }
  await claimMulti(watch,{last_checked_at:now});
  return {id:watch.id,round:next,matched_count:0};
}

async function pollOne(watch: any) {
  if(trackedIds(watch).length>1)return await pollMulti(watch);
  const now = new Date().toISOString();
  const {rank:finalRanking,batch:pairing}=await parallelWatchLookup(watch,watch.player_id);

  if (!watch.final_notified && finalRanking.available && finalRanking.is_final && finalRanking.standing_match) {
    const detected=Date.now();
    const name=await resolveName(finalRanking.standing_match.player);
    trace("notice-prepared",{watch_id:watch.id,round:watch.next_round,type:"final",elapsed_ms:Date.now()-detected});
    const claimed=await claimMulti(watch,{
      final_notified:true,
      final_result:{rank:finalRanking.standing_match.rank,player:finalRanking.standing_match.player,player_name:name},
      active:false,last_checked_at:now
    });
    if(!claimed)return {id:watch.id,skipped:true};
    const notice=await notifyFinalRank(watch.user_id,finalRanking,false,name);
    trace("notice-finished",{watch_id:watch.id,round:watch.next_round,type:"final",elapsed_ms:Date.now()-detected,line_accepted:notice.line.sent,push_accepted:notice.push.sent});
    return {id:watch.id,final_rank:true,standing:{rank:finalRanking.standing_match.rank,player:finalRanking.standing_match.player},notice};
  }

  if (!pairing.available || !pairing.match) {
    await claimMulti(watch,{last_checked_at:now});
    return {id:watch.id,round:watch.next_round,available:Boolean(pairing.available),matched:false};
  }
  const detected=Date.now();
  const prepared=await prepareMatch(watch.user_id,pairing);
  trace("notice-prepared",{watch_id:watch.id,round:watch.next_round,type:"round",elapsed_ms:Date.now()-detected});
  const claimed=await claimMulti(watch,{
    current_round:watch.next_round,next_round:Number(watch.next_round)+1,last_notified_round:watch.next_round,
    last_match:{...pairing.match,player_name:prepared[0],opponent_name:prepared[1]},last_checked_at:now
  });
  if(!claimed)return {id:watch.id,skipped:true};
  const notice=await notifyMatch(watch.user_id,pairing,false,prepared);
  trace("notice-finished",{watch_id:watch.id,round:watch.next_round,type:"round",elapsed_ms:Date.now()-detected,line_accepted:notice.line.sent,push_accepted:notice.push.sent});
  return {id:watch.id,round:watch.next_round,available:true,matched:true,notice};
}

async function pollAll() {
  const { data: watches, error } = await service.from("pairing_watches").select("*").eq("active", true);
  if (error) throw error;
  const results: unknown[] = [];
  await Promise.all((watches||[]).map(async(watch:any)=>{
    try {
      const {data:allowed,error}=await service.rpc("is_pairing_member",{target_user:watch.user_id});
      if(error||allowed!==true){if(!error)await service.from("pairing_watches").update({active:false,updated_at:new Date().toISOString()}).eq("id",watch.id).eq("updated_at",watch.updated_at);return;}
      results.push(await pollOne(watch));
    }catch(error:any){trace("poll-error",{watch_id:watch.id,round:watch.next_round});results.push({id:watch.id,error:String(error?.message||error)});}
  }));
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "poll") {
      const {data:cfg,error}=await service.rpc("get_ptcg_github_trigger_config_for_service");
      const secret=String(cfg?.cron_secret||"");
      if(error||!secret||req.headers.get("x-ptcg-cron-secret")!==secret)return json({ok:false,error:"unauthorized"},403);
      const results=await pollAll();
      return json({ok:true,checked:results.length});
    }

    const user = await requireUser(req);
    if (["lookup-multi","final-multi","start-multi","test-multi","test-final-multi"].includes(action)) {
      const ids=validatePlayerIds(body.player_ids),source=String(body.url||"");
      parseRoundUrl(source);
      if(action==="start-multi")return json({ok:true,watch:await startMulti(user.id,source,ids)});
      const isRank=action==="final-multi"||action==="test-final-multi";
      const batch=isRank?await readCurrentRank(source,ids):await fetchPairing(source,ids);
      const finals=isRank?rankingFinals(batch,ids):{};
      const cards=await multiCards(user.id,batch,ids,finals);
      if(action==="test-multi"&&!cards.some(c=>c.table))throw new Error("本輪尚未找到追蹤玩家");
      if(action==="test-final-multi"&&(!batch.is_final||!Object.keys(finals).length))throw new Error("正式最終排名尚未公布");
      const notification=action.startsWith("test-")?await notifyMulti(user.id,batch,cards,isRank?"final":"round",true):null;
      return json({ok:true,batch,cards,notification});
    }
    if (action === "start") {
      const sourceUrl = String(body?.url || "");
      const playerId = String(body?.player_id || "");
      if (!sourceUrl || !/^tw\d+$/i.test(playerId)) throw new Error("請提供有效配對網址與 PTCG ID");
      const existing=await getStatus(user.id);
      if(existing?.active&&trackedIds(existing).length>1&&!(Array.isArray(body.player_ids)&&body.player_ids.length===1&&body.player_ids[0]===playerId))
        throw new Error("目前已有多玩家追蹤，請先更新網頁或停止追蹤");
      return json({ ok: true, watch: await startWatch(user.id, sourceUrl, playerId) });
    }
    if (action === "stop") return json({ ok: true, watch: await stopWatch(user.id) });
    if (action === "status") return json({ ok: true, watch: await getStatus(user.id) });
    if (action === "test") {
      const sourceUrl = String(body?.url || "");
      const playerId = String(body?.player_id || "");
      if (!sourceUrl || !/^tw\d+$/i.test(playerId)) throw new Error("請提供有效配對網址與 PTCG ID");
      const pairing = await fetchPairing(parseRoundUrl(sourceUrl).url.toString(), playerId);
      if (!pairing.match) throw new Error("此 Round 找不到指定玩家配對");
      return json({ ok: true, pairing, notification: await notifyMatch(user.id, pairing, true) });
    }
    if (action === "test-final") {
      const sourceUrl = String(body?.url || "");
      const playerId = String(body?.player_id || "");
      if (!sourceUrl || !/^tw\d+$/i.test(playerId)) throw new Error("請提供有效配對網址與 PTCG ID");
      const ranking = await readCurrentRank(sourceUrl, playerId);
      if (!ranking.is_final || !ranking.standing_match) throw new Error("正式最終排名尚未公布，暫定排名不會發送最終通知");
      return json({
        ok: true,
        ranking: {
          title: ranking.title,
          tid: ranking.tid,
          standing_match: {
            rank: ranking.standing_match.rank,
            player: ranking.standing_match.player,
          },
        },
        notification: await notifyFinalRank(user.id, ranking, true),
      });
    }
    if (action === "final") {
      const sourceUrl = String(body?.url || "");
      const playerId = String(body?.player_id || "");
      if (!sourceUrl || !/^tw\d+$/i.test(playerId)) throw new Error("請提供有效配對網址與 PTCG ID");
      const ranking = await readCurrentRank(sourceUrl, playerId);
      return json({
        ok: true,
        ranking: {
          title: ranking.title,
          tid: ranking.tid,
          available: ranking.available,
          rank_status: ranking.rank_status || "unconfirmed",
          is_interim: Boolean(ranking.is_interim),
          is_final: Boolean(ranking.is_final),
          source_url: ranking.source_url,
          round: ranking.round,
          standing_count: ranking.standing_count || 0,
          standing_match: ranking.standing_match ? {
            rank: ranking.standing_match.rank,
            player: ranking.standing_match.player,
          } : null,
        },
      });
    }
    return json({ ok: false, error: "invalid action" }, 400);
  } catch (error: any) {
    console.error(error);
    const message = String(error?.message || error);
    const status = /authorization|unauthorized/i.test(message) ? 401 : 400;
    return json({ ok: false, error: message }, status);
  }
});
