import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = (Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "").trim();
const LINE_USER_ID = (Deno.env.get("LINE_USER_ID") || "").trim();

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE_BASE = "https://guoer11.github.io/ptcg-ranking/";
const RANKING_URL = "https://raw.githubusercontent.com/guoer11/ptcg-ranking/main/data/ranking.json";
const TOURNAMENT_URL = "https://raw.githubusercontent.com/guoer11/ptcg-ranking/main/data/tournaments.json";
const LEAGUE_LABELS: Record<string, string> = { Great: "超級球", Ultra: "高級球", Premier: "紀念球", Master: "大師球" };
const GROUP_LABELS: Record<string, string> = { Junior: "孩童組", Senior: "少年組", Master: "大師組" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://guoer11.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }); }
function lineConfigured() { return Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_USER_ID); }

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw new Error("missing authorization");
  const { data, error } = await service.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error("unauthorized");
  const {data:allowed,error:allowError}=await service.rpc("is_pairing_authorized",{target_user:data.user.id});
  if(allowError||allowed!==true)throw new Error("unauthorized");
  return data.user;
}

async function verifyLineToken() {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return { valid: false, reason: "missing_token" };
  const response = await fetch("https://api.line.me/v2/oauth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: LINE_CHANNEL_ACCESS_TOKEN }),
  });
  const detail = await response.json().catch(() => ({}));
  return response.ok
    ? { valid: true, clientId: String(detail?.client_id || ""), expiresIn: detail?.expires_in ?? null }
    : { valid: false, status: response.status, reason: String(detail?.error_description || detail?.error || detail?.message || "invalid_token") };
}

async function lineApiGet(path: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE Channel access token 尚未設定");
  const response = await fetch(`https://api.line.me${path}`, {
    headers: { "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  const detail = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LINE API HTTP ${response.status}: ${String(detail?.message || JSON.stringify(detail)).slice(0, 240)}`);
  }
  return detail;
}

async function getLineUsage() {
  const [quota, consumption] = await Promise.all([
    lineApiGet("/v2/bot/message/quota"),
    lineApiGet("/v2/bot/message/quota/consumption"),
  ]);
  return {
    quotaType: String(quota?.type || ""),
    limit: typeof quota?.value === "number" ? quota.value : null,
    totalUsage: Number(consumption?.totalUsage ?? 0),
    approximate: true,
  };
}

async function sendLine(title: string, body: string, url = SITE_BASE) {
  if (!lineConfigured()) throw new Error("LINE secrets are not configured");
  const text = [`🔔 ${title}`, body, url].filter(Boolean).join("\n");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`LINE API HTTP ${response.status}: ${detail}`);
  }
  return { sent: true };
}

async function fetchJson(url: string) {
  const response = await fetch(`${url}?line=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.json();
}
async function getWatchState(kind: string) {
  const { data, error } = await service.from("line_watch_state").select("payload,checked_at").eq("kind", kind).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function setWatchState(kind: string, payload: unknown) {
  const { error } = await service.from("line_watch_state").upsert({ kind, payload, checked_at: new Date().toISOString() }, { onConflict: "kind" });
  if (error) throw error;
}
function rankingGroups(payload: any) { return payload?.groups || {}; }
function rankingCount(payload: any) { const groups = rankingGroups(payload); return ["Junior", "Senior", "Master"].reduce((sum, key) => sum + (Array.isArray(groups[key]) ? groups[key].length : 0), 0); }
function jsonEqual(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function rankingSignature(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((item:any) => [
    String(item?.player_id || item?.name || "").toLowerCase(),
    item?.rank ?? null,
    item?.points ?? null,
  ]).sort((a:any[], b:any[]) => String(a[0]).localeCompare(String(b[0])));
}
function normalizeGroupedTitle(title: string) { return String(title || "").replace(/\s*[（(](孩童組|少年組|大師組)[）)]\s*$/u, "").replace(/\s+TCG\s+Category\s+(Junior|Senior|Master)\s+Division\s*$/i, "").replace(/\s+/g, " ").trim(); }
function physicalEventKey(event: any) { if ((event?.group || "Open") === "Open") return `id:${event?.event_id}`; return [event?.league, event?.date, normalizeGroupedTitle(event?.title || "")].join("|"); }
function formatMD(dateValue: string) { const match = String(dateValue || "").match(/^\d{4}-(\d{2})-(\d{2})/); return match ? `${Number(match[1])}/${Number(match[2])}` : "日期未定"; }

async function pollRanking() {
  const current = await fetchJson(RANKING_URL);
  const state = await getWatchState("ranking");
  if (!state) { await setWatchState("ranking", current); return { baseline: true, notified: false }; }
  const previous = state.payload || {};
  const currentGroups = rankingGroups(current), previousGroups = rankingGroups(previous);
  const changed = ["Junior", "Senior", "Master"].filter(group => !jsonEqual(rankingSignature(currentGroups[group] || []), rankingSignature(previousGroups[group] || [])));
  let notification: unknown = null;
  if (changed.length && rankingCount(current) > 0) {
    const labels = changed.map(group => GROUP_LABELS[group] || group).join("、");
    const firstPublished = rankingCount(previous) === 0;
    notification = await sendLine(firstPublished ? "2026-27 官方排行榜已公布" : "PTCG 官方排行榜已更新", firstPublished ? `${labels}已有正式排名資料，可以到網站查看。` : `${labels}排名／積分有新的變動。`, SITE_BASE);
  }
  await setWatchState("ranking", current);
  return { baseline: false, changed, notification };
}

async function pollTournaments() {
  const current = await fetchJson(TOURNAMENT_URL);
  const state = await getWatchState("tournaments");
  if (!state) { await setWatchState("tournaments", current); return { baseline: true, notifications: [] }; }
  const previous = state.payload || { events: [] };
  const oldMap = new Map((previous.events || []).filter((item:any)=>item?.event_id).map((item:any)=>[String(item.event_id),item]));
  const currentMap = new Map((current.events || []).filter((item:any)=>item?.event_id).map((item:any)=>[String(item.event_id),item]));
  const newEvents = [...currentMap.entries()].filter(([id])=>!oldMap.has(id)).map(([,event])=>event as any);
  const resultUpdates = [...currentMap.entries()].filter(([id,event]: any) => {
    const old: any = oldMap.get(id);
    return old && (!Array.isArray(old?.results) || old.results.length === 0) && Array.isArray(event?.results) && event.results.length > 0;
  }).map(([,event])=>event as any);
  const notifications: unknown[] = [];
  const byLeague = new Map<string, any[]>();
  for (const event of newEvents) { if (!LEAGUE_LABELS[event?.league]) continue; const list = byLeague.get(event.league) || []; list.push(event); byLeague.set(event.league, list); }
  for (const [league, events] of byLeague.entries()) {
    const physical = new Map<string, any>();
    for (const event of events) physical.set(physicalEventKey(event), event);
    const items = [...physical.values()].sort((a,b)=>String(a?.date||"").localeCompare(String(b?.date||"")));
    const dates = [...new Set(items.map(item=>formatMD(item?.date)))];
    let dateText = dates.slice(0,4).join("、"); if (dates.length > 4) dateText += "…";
    notifications.push(await sendLine(`新增 ${LEAGUE_LABELS[league]}賽事`, `官方新增 ${items.length} 場${LEAGUE_LABELS[league]}賽事${dateText ? `：${dateText}` : "。"}`, `${SITE_BASE}tournaments.html`));
  }
  if (resultUpdates.length) {
    notifications.push(await sendLine(
      "官方賽事成績已公布",
      `有 ${resultUpdates.length} 筆活動新增官方成績，可以到賽事資訊查看。`,
      `${SITE_BASE}tournaments.html`
    ));
  }
  await setWatchState("tournaments", current);
  return { baseline: false, newEvents: newEvents.length, resultUpdates: resultUpdates.length, notifications };
}
async function pollAll() {
  const result: Record<string, unknown> = {};
  try { result.ranking = await pollRanking(); } catch (error:any) { result.rankingError = String(error?.message || error); }
  try { result.tournaments = await pollTournaments(); } catch (error:any) { result.tournamentsError = String(error?.message || error); }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "status") {
      await requireUser(req);
      const verification = lineConfigured() ? await verifyLineToken() : { valid: false, reason: "not_configured" };
      let usage: unknown = null;
      if (verification.valid) {
        try { usage = await getLineUsage(); } catch (error:any) { usage = { error: String(error?.message || error) }; }
      }
      return json({ ok: true, configured: lineConfigured(), tokenValid: verification.valid, tokenStatus: verification, usage });
    }
    if (action === "quota") {
      await requireUser(req);
      const verification = await verifyLineToken();
      if (!verification.valid) return json({ error: "LINE Channel access token 無效。", tokenStatus: verification }, 401);
      return json({ ok: true, usage: await getLineUsage() });
    }
    if (action === "test") {
      await requireUser(req);
      const verification = await verifyLineToken();
      if (!verification.valid) return json({ error: "LINE Channel access token 無效，請重新發行後更新 Supabase Secret。", tokenStatus: verification }, 401);
      await sendLine("PTCG LINE 通知測試", "LINE 通知已成功連線。之後官方排行榜或新賽事有變動時會通知你。", SITE_BASE);
      let usage: unknown = null;
      try { usage = await getLineUsage(); } catch (error:any) { usage = { error: String(error?.message || error) }; }
      return json({ ok: true, sent: true, usage });
    }
    if (action === "poll") return json({ ok: true, ...(await pollAll()) });
    return json({ error: "invalid action" }, 400);
  } catch (error:any) {
    console.error(error);
    const message = String(error?.message || error);
    const status = /authorization|unauthorized/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
