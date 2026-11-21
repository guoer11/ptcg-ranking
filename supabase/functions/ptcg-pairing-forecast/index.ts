import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createReader, sourceTid } from "./source.ts";
const headers={"Access-Control-Allow-Origin":"https://guoer11.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const reader=createReader();
export function createHandler(authService:any,dataReader:any=reader) {
  return async(req:Request)=>{
    if(req.method==="OPTIONS")return new Response("ok",{headers});
    if(req.method!=="POST")return json({ok:false,error:"method not allowed"},405);
    try {
      const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
      if(!token)return json({ok:false,error:"請先登入授權帳號。"},401);
      const {data,error}=await authService.auth.getUser(token);
      if(error || !data?.user)return json({ok:false,error:"登入已失效，請重新登入。"},401);
      const {data:allowed,error:allowError}=await authService.rpc("is_pairing_authorized",{target_user:data.user.id});
      if(allowError || allowed!==true)return json({ok:false,error:"此帳號未授權使用即時配對。"},403);
      const raw=await req.text();if(raw.length>8192)return json({ok:false,error:"request too large"},413);
      let body:any;try{body=JSON.parse(raw);}catch{return json({ok:false,error:"invalid JSON"},400);}
      const tid=sourceTid(String(body.url||""));
      const player=String(body.player_id||"").trim().toLowerCase();
      if(!/^tw\d{6,12}$/.test(player))throw new Error("請確認追蹤玩家的 PTCG ID。");
      if(body.action==="final")return json(await dataReader.final(tid,player));
      if(body.action && body.action!=="snapshot")throw new Error("invalid action");
      const total=Number(body.total_rounds),round=body.round==="auto"?"auto":Number(body.round);
      if(!Number.isInteger(total)||total<1||total>20)throw new Error("總輪數請填 1–20，並以現場公告為準。");
      if(round!=="auto" && (!Number.isInteger(round)||round<1||round>total))throw new Error("Round 必須在總輪數範圍內。");
      if(round==="auto") {
        const completed=await dataReader.final(tid,player);
        if(completed.available)return json(completed);
      }
      return json(await dataReader.snapshot(tid,round,total));
    } catch(error:any) {
      console.error("pairing forecast:",error?.name,error?.message);
      const message=error?.name==="TimeoutError"?"官方頁面回應較慢，請再按更新重試。":String(error?.message||"配對資料讀取失敗。");
      return json({ok:false,error:message},400);
    }
  };
}
Deno.serve(createHandler(service));
