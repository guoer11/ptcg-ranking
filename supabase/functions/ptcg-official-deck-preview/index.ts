import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import pngjs from "npm:pngjs@7.0.0";
import jpeg from "npm:jpeg-js@0.4.4";
import {Buffer} from "node:buffer";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=db.storage.from("official-deck-images");
const now=()=>new Date().toISOString();
const later=(mins:number)=>new Date(Date.now()+mins*60000).toISOString();
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function check(r:any){if(r.error)throw Error(r.error.message||String(r.error));return r.data;}
function preview(bytes:Uint8Array){
 if(bytes.length<32||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error("invalid PNG");
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=header.getUint32(16),h=header.getUint32(20);
 if(!w||!h||w*h>16000000)throw Error("PNG exceeds safe pixel limit");
 const image=pngjs.PNG.sync.read(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),{checkCRC:true});
 const scale=Math.min(1,1400/w,1400/h),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
 const rgba=new Uint8Array(width*height*4),src=image.data;
 for(let y=0;y<height;y++){
  const y0=Math.min(h-1,Math.floor((y+.25)*h/height)),y1=Math.min(h-1,Math.floor((y+.75)*h/height));
  for(let x=0;x<width;x++){
   const x0=Math.min(w-1,Math.floor((x+.25)*w/width)),x1=Math.min(w-1,Math.floor((x+.75)*w/width));
   const a=(y0*w+x0)*4,b=(y0*w+x1)*4,c=(y1*w+x0)*4,d=(y1*w+x1)*4,i=(y*width+x)*4;
   for(let k=0;k<3;k++)rgba[i+k]=Math.round((src[a+k]*src[a+3]+255*(255-src[a+3])+src[b+k]*src[b+3]+255*(255-src[b+3])+src[c+k]*src[c+3]+255*(255-src[c+3])+src[d+k]*src[d+3]+255*(255-src[d+3]))/1020);
   rgba[i+3]=255;
  }
 }
 return {bytes:jpeg.encode({data:rgba,width,height},82).data,width,height,source_width:w,source_height:h};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({ok:false},405);
 try{
  const config=check(await db.rpc("get_ptcg_github_trigger_config_for_service")),secret=String(config?.cron_secret||"");
  if(!secret||req.headers.get("x-ptcg-cron-secret")!==secret)return json({ok:false},403);
  const body=await req.json(),code=String(body.code||"");
  if(code&&!/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(code))return json({ok:false},400);
  const jobs=check(await db.rpc("official_deck_image_jobs",{p_mode:"preview",p_limit:200}))||[];
  const rows=code?jobs.filter((r:any)=>r.code===code).slice(0,1):jobs.slice(0,1);
  if(!rows.length)return json({ok:true,pending:false});
  const row=rows[0],path=row.code+".jpg";
  const claimed=check(await db.from("official_deck_recipes").update({preview_next_attempt_at:later(60)}).eq("code",row.code).eq("preview_next_attempt_at",row.preview_next_attempt_at).is("preview_path",null).select("code"));
  if(!claimed.length)return json({ok:true,skipped:true});
  // Respect the existing 750 MiB archive ceiling, reserving 1 MiB for this preview.
  let used=0;
  for(let offset=0;offset<5000;offset+=100){
   const objects=check(await bucket.list("",{limit:100,offset,sortBy:{column:"name",order:"asc"}}))||[];
   for(const object of objects)used+=Number(object.metadata?.size||0);
   if(objects.length<100)break;
  }
  if(used>=749*1024*1024)return json({ok:true,skipped:"storage ceiling"});
  const start=Date.now();
  const old=row.image_path===row.code+".png"?await bucket.download(row.image_path):null;
  let source=old?.data;
  if(!source){
   const response=await fetch("https://asia.pokemon-card.com/tw/deck-img/"+row.code+".png",{redirect:"error",signal:AbortSignal.timeout(16000)});
   if(!response.ok)throw Error("official source HTTP "+response.status);
   source=await response.blob();
  }
  if(source.size>8388608)throw Error("original too large");
  const bytes=new Uint8Array(await source.arrayBuffer());
  const result=preview(bytes);
  if(result.bytes.length>1024*1024)throw Error("preview too large");
  const uploaded=await bucket.upload(path,result.bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"3600"});
  if(uploaded.error){const exists=await bucket.download(path);if(exists.error||!exists.data)throw uploaded.error;const existing=new Uint8Array(await exists.data.arrayBuffer());if(existing[0]!==255||existing[1]!==216)throw uploaded.error;}
  check(await db.from("official_deck_recipes").update({preview_path:path}).eq("code",row.code).is("preview_path",null));
  return json({ok:true,code:row.code,original_bytes:bytes.length,preview_bytes:result.bytes.length,width:result.width,height:result.height,source_width:result.source_width,source_height:result.source_height,elapsed_ms:Date.now()-start});
 }catch(e){console.warn("official deck preview",String(e));return json({ok:false,error:String(e)},500);}
});
