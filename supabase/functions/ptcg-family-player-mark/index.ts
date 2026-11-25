import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://guoer11.github.io",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const body = await req.json().catch(() => ({}));
  const endpoint = String(body?.endpoint || "").trim();
  if (body?.action === "family-marks") {
    const auth=String(body?.auth||"").trim();
    const ids=Array.isArray(body?.player_ids)?[...new Set<string>(body.player_ids.map((id:unknown)=>String(id).trim().toLowerCase()))]:[];
    if(!endpoint||endpoint.length>2048||!(/^[A-Za-z0-9_-]{22}$/.test(auth))||ids.length<1||ids.length>10||ids.some(id=>!/^tw\d{1,16}$/.test(id)))return json({ok:false},400);
    // Require the active device endpoint AND its secret Web Push auth key.
    // Never return notes from the legacy endpoint-only lookup.
    const {data:device,error:deviceError}=await service.from("family_push_subscriptions")
      .select("owner_user_id").eq("endpoint",endpoint).eq("auth",auth).eq("active",true).maybeSingle();
    if(deviceError||!device?.owner_user_id)return json({ok:false},403);
    const {data:allowed,error:allowError}=await service.rpc("is_pairing_member",{target_user:device.owner_user_id});
    if(allowError||!allowed)return json({ok:false},403);
    const {data:rows,error}=await service.from("player_attention_marks")
      .select("player_id,note").eq("user_id",device.owner_user_id).in("player_id",ids);
    if(error)return json({ok:false},500);
    const marks=Object.fromEntries(ids.map(id=>[id,{attention:false,note:""}]));
    for(const row of rows||[])if(Object.hasOwn(marks,row.player_id))marks[row.player_id]={attention:true,note:String(row.note||"")};
    return json({ok:true,marks});
  }
  const playerId = String(body?.player_id || "").trim().toLowerCase();
  if (!endpoint || !/^tw\d+$/.test(playerId)) return json({ ok: false }, 400);
  const { data, error } = await client.rpc("family_player_attention", {
    p_endpoint: endpoint,
    p_player_id: playerId,
  });
  if (error) return json({ ok: false }, 400);
  return json({ ok: true, attention: data === true });
});
