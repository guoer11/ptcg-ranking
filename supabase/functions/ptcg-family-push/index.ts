import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendNotification } from "npm:web-push-neo@0.1.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const FAMILY_PAGE_URL = "https://guoer11.github.io/ptcg-ranking/family-notify.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://guoer11.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function requireAuthorizedUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("missing authorization");
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) throw new Error("unauthorized");
  const { data: allowed, error: allowError } = await service.rpc("is_pairing_authorized", { target_user: data.user.id });
  if (allowError || !allowed) throw new Error("unauthorized");
  return data.user;
}

function randomToken(bytes = 24) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of raw) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function loadVapid() {
  const { data, error } = await service.rpc("get_push_vapid_config_for_service");
  if (error || !data?.public_key || !data?.private_key) throw new Error(error?.message || "VAPID config unavailable");
  return { subject: data.subject, publicKey: data.public_key, privateKey: data.private_key };
}

async function sendConfirmation(subscription: any) {
  const vapid = await loadVapid();
  await sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify({
      title: "家庭配對通知已啟用",
      body: "之後 Round 配對與最終排名公布時，這支裝置 會收到網站推播。",
      url: "/ptcg-ranking/family-notify.html",
      tag: "ptcg-family-push-ready",
    }),
    { vapidDetails: vapid, TTL: 300 },
  );
}

const DEFAULT_IDS = ["tw39371632","tw69121729"];
function filterSettings(body: any) {
  const mode = body?.player_filter_mode ?? "all";
  if (mode !== "all" && mode !== "custom") throw new Error("通知模式錯誤");
  if (mode === "all") return { player_filter_mode: "all", allowed_player_ids: [] as string[] };
  if (!Array.isArray(body?.allowed_player_ids)) throw new Error("請指定接收玩家");
  const ids = [...new Set<string>(body.allowed_player_ids.map((v: unknown)=>String(v).trim().toLowerCase()))];
  if (ids.length < 1 || ids.length > 5 || ids.some(id=>!/^tw\d{1,16}$/.test(id))) throw new Error("請指定 1 至 5 位有效玩家");
  return { player_filter_mode: "custom", allowed_player_ids: ids };
}
async function playerOptions(userId: string, extras: string[] = []) {
  const {data,error}=await service.from("pairing_watches").select("player_id,player_ids").eq("user_id",userId).eq("active",true);
  if(error)throw error;
  const ids=[...new Set([...DEFAULT_IDS,...(data||[]).flatMap((w:any)=>w.player_ids?.length?w.player_ids:[w.player_id]),...extras])].filter(id=>/^tw\d{1,16}$/.test(id));
  const {data:names,error:nameError}=await service.from("player_identities").select("player_id,real_name").in("player_id",ids);
  if(nameError)throw nameError;
  return ids.map(id=>({id,name:names?.find((n:any)=>n.player_id===id)?.real_name||""}));
}
async function createInvite(userId: string, label: string, settings: any) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const safeLabel = String(label || "家庭裝置").trim().slice(0, 40) || "家庭裝置";
  const { error } = await service.from("family_push_invites").insert({
    owner_user_id: userId,
    token_hash: tokenHash,
    device_label: safeLabel,
    ...filterSettings(settings),
    expires_at: expiresAt,
  });
  if (error) throw error;
  const inviteUrl = `${FAMILY_PAGE_URL}?token=${encodeURIComponent(token)}`;
  return { invite_url: inviteUrl, expires_at: expiresAt, device_label: safeLabel };
}

async function listDevices(userId: string) {
  const { data, error } = await service.from("family_push_subscriptions")
    .select("id,device_label,active,created_at,updated_at,player_filter_mode,allowed_player_ids,device_platform")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function removeDevice(userId: string, id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error("invalid device id");
  const { data: device, error: readError } = await service.from("family_push_subscriptions")
    .select("endpoint")
    .eq("owner_user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!device) return;

  const { error: pushError } = await service.from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", device.endpoint);
  if (pushError) throw pushError;

  const { error } = await service.from("family_push_subscriptions")
    .delete()
    .eq("owner_user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

async function subscribeFamily(token: string, subscription: any, platform: string) {
  const cleanToken = String(token || "").trim();
  if (cleanToken.length < 20) throw new Error("邀請連結無效");
  const tokenHash = await sha256(cleanToken);
  const { data: invite, error: inviteError } = await service.from("family_push_invites")
    .select("id,owner_user_id,device_label,expires_at,used_at,player_filter_mode,allowed_player_ids")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) throw new Error("邀請連結不存在或已失效");
  if (invite.used_at) throw new Error("這個邀請連結已經使用過");
  if (Date.parse(invite.expires_at) <= Date.now()) throw new Error("這個邀請連結已過期，請重新產生");

  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();
  if (!/^https:\/\//i.test(endpoint) || endpoint.length>2048 || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth)) throw new Error("推播訂閱資料不完整");
  const {data:existing,error:existingError}=await service.from("push_subscriptions").select("user_id,auth").eq("endpoint",endpoint).maybeSingle();
  if(existingError)throw existingError;
  if(existing){
    const {data:family,error:familyError}=await service.from("family_push_subscriptions").select("id,owner_user_id,auth").eq("endpoint",endpoint).maybeSingle();
    if(familyError)throw familyError;
    if(!family||family.owner_user_id!==invite.owner_user_id||family.auth!==auth||existing.user_id!==invite.owner_user_id||existing.auth!==auth)throw new Error("此裝置已綁定其他通知，請使用獨立家庭裝置");
  }

  const now = new Date().toISOString();
  const familyRow = {
    owner_user_id: invite.owner_user_id,
    device_label: invite.device_label,
    ...filterSettings(invite),
    device_platform: ["ios","android","other"].includes(platform)?platform:"unknown",
    endpoint,
    p256dh,
    auth,
    active: true,
    updated_at: now,
  };
  const { data: saved, error: saveError } = await service.from("family_push_subscriptions")
    .upsert(familyRow, { onConflict: "endpoint" })
    .select("id,device_label,created_at")
    .single();
  if (saveError) throw saveError;

  const { error: pushSaveError } = await service.from("push_subscriptions")
    .upsert({
      user_id: invite.owner_user_id,
      endpoint,
      p256dh,
      auth,
      notify_ranking: false,
      notify_great: false,
      notify_ultra: false,
      notify_premier: false,
      notify_master: false,
      notify_results: false,
      notify_pairing: true,
      updated_at: now,
    }, { onConflict: "endpoint" });
  if (pushSaveError) throw pushSaveError;

  const { error: usedError } = await service.from("family_push_invites")
    .update({ used_at: now })
    .eq("id", invite.id)
    .is("used_at", null);
  if (usedError) throw usedError;

  let confirmationSent = false;
  try {
    await sendConfirmation({ endpoint, p256dh, auth });
    confirmationSent = true;
  } catch (error) {
    console.warn("family confirmation push failed", error);
  }

  return { device: saved, confirmation_sent: confirmationSent };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "public-key") {
      const vapid = await loadVapid();
      return json({ ok: true, publicKey: vapid.publicKey });
    }

    if (action === "subscribe") {
      const result = await subscribeFamily(String(body?.token || ""), body?.subscription || {}, String(body?.device_platform || "unknown"));
      return json({ ok: true, ...result });
    }

    if(action === "device-status") {
      const endpoint=String(body?.endpoint||""), auth=String(body?.auth||"");
      if(!endpoint || endpoint.length>2048 || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return json({ok:false,error:"裝置驗證失敗"},403);
      const {data:device,error}=await service.from("family_push_subscriptions").select("owner_user_id,device_label,player_filter_mode,allowed_player_ids,device_platform").eq("endpoint",endpoint).eq("auth",auth).eq("active",true).maybeSingle();
      if(error||!device)return json({ok:false,error:"裝置未綁定或已移除"},403);
      const {data:allowed,error:allowError}=await service.rpc("is_pairing_authorized",{target_user:device.owner_user_id});
      if(allowError||!allowed)return json({ok:false,error:"裝置未授權"},403);
      const {owner_user_id,...safe}=device;
      const players=(await playerOptions(owner_user_id,safe.allowed_player_ids)).filter(p=>safe.player_filter_mode==="all"||safe.allowed_player_ids.includes(p.id));
      return json({ok:true,device:safe,players});
    }
    const user = await requireAuthorizedUser(req);
    if (action === "create-invite") {
      return json({ ok: true, ...(await createInvite(user.id, String(body?.device_label || "家庭裝置"), body)) });
    }
    if (action === "list-devices") {
      const devices=await listDevices(user.id);
      return json({ok:true,devices,players:await playerOptions(user.id,devices.flatMap((d:any)=>d.allowed_player_ids||[]))});
    }
    if(action === "update-device"){
      const id=Number(body?.device_id);
      if(!Number.isInteger(id)||id<1)throw new Error("裝置編號無效");
      const device_label=String(body?.device_label||"").trim().slice(0,40);
      if(!device_label)throw new Error("請輸入裝置名稱");
      const {data,error}=await service.from("family_push_subscriptions").update({device_label,...filterSettings(body),updated_at:new Date().toISOString()}).eq("owner_user_id",user.id).eq("id",id).select("id").maybeSingle();
      if(error)throw error;
      if(!data)throw new Error("找不到家庭裝置");
      const devices=await listDevices(user.id);
      return json({ok:true,devices,players:await playerOptions(user.id,devices.flatMap((d:any)=>d.allowed_player_ids||[]))});
    }
    if(action === "test-device"){
      const all=body?.device_id==="all", id=Number(body?.device_id);
      if(!all&&(!Number.isInteger(id)||id<1))throw new Error("裝置編號無效");
      let q=service.from("family_push_subscriptions").select("id,device_label,endpoint,p256dh,auth,player_filter_mode,allowed_player_ids").eq("owner_user_id",user.id).eq("active",true);
      if(!all)q=q.eq("id",id);
      const {data:rows,error}=await q;
      if(error)throw error;
      if(!rows?.length)throw new Error("沒有可測試的裝置");
      const vapid=await loadVapid();
      const results=[];
      for(const row of rows){
        try{
          await sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify({title:"[測試] 家庭裝置通知",body:row.device_label+"｜"+(row.player_filter_mode==="custom"?row.allowed_player_ids.join("、"):"全部追蹤玩家"),url:"/ptcg-ranking/family-notify.html",tag:"ptcg-family-test"}),{vapidDetails:vapid,TTL:300});
          results.push({id:row.id,device_label:row.device_label,sent:true});
        }catch(e:any){
          const status=Number(e?.statusCode||0);
          if(status===404||status===410){
            await service.from("family_push_subscriptions").update({active:false}).eq("owner_user_id",user.id).eq("id",row.id);
          }
          results.push({id:row.id,device_label:row.device_label,sent:false,status});
        }
      }
      return json({ok:true,results});
    }
    if (action === "remove-device") {
      await removeDevice(user.id, Number(body?.device_id));
      return json({ ok: true, devices: await listDevices(user.id) });
    }

    return json({ ok: false, error: "invalid action" }, 400);
  } catch (error: any) {
    console.error(error);
    const message = String(error?.message || error);
    const status = /authorization|unauthorized/i.test(message) ? 401 : 400;
    return json({ ok: false, error: message }, status);
  }
});
