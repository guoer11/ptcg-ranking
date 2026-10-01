import * as cheerio from "npm:cheerio@1.0.0";
import { clean, parseRoundRows, buildSnapshot, parseStandings } from "./model.mjs";
const HOST = "tcg.sfc-jpn.jp";
const MAX_PAGES = 100;
const cache = new Map<string, { at:number; value:Promise<any> }>();

export function sourceTid(input:string) {
  let url:URL;
  try { url=new URL(input); } catch { throw new Error("請先在上方貼上有效的活動網址。"); }
  if(!["https:","http:"].includes(url.protocol) || url.hostname!==HOST || url.port || url.username || url.password || !/^\/tour(?:round)?\.asp$/i.test(url.pathname))throw new Error("只接受 tcg.sfc-jpn.jp 的活動或配對網址。");
  const tid=url.searchParams.get("tid") || "";
  if(!/^\d{1,12}$/.test(tid))throw new Error("活動網址缺少有效 tid。");
  return tid;
}

async function cached(key:string,read:()=>Promise<any>) {
  const now=Date.now(),prior=cache.get(key);
  if(prior && now-prior.at<20000)return prior.value;
  if(cache.size>=160)cache.delete(cache.keys().next().value!);
  const value=read();cache.set(key,{at:now,value});
  try {return await value;} catch(error){if(cache.get(key)?.value===value)cache.delete(key);throw error;}
}

export function createReader(fetcher:typeof fetch=fetch) {
  async function html(url:string) {
    return cached(url,async()=>{
      let source=url,response:Response|null=null;
      for(let i=0;i<4;i++) {
        const parsed=new URL(source);
        if(parsed.hostname!==HOST || parsed.protocol!=="https:" || parsed.port || parsed.username || parsed.password)throw new Error("官方來源轉址無法確認。");
        response=await fetcher(source,{headers:{"User-Agent":"Mozilla/5.0 (compatible; PTCG-Ranking/1.11; +https://guoer11.github.io/ptcg-ranking/)","Accept":"text/html","Cache-Control":"no-cache"},redirect:"manual",signal:AbortSignal.timeout(12000)});
        if(response.status>=300 && response.status<400) {
          const location=response.headers.get("location");if(!location)throw new Error("官方頁面轉址不完整。");
          source=new URL(location,source).toString();continue;
        }
        break;
      }
      if(!response?.ok)throw new Error(`官方配對頁讀取失敗（HTTP ${response?.status || "—"}），請稍後重試。`);
      const buffer=new Uint8Array(await response.arrayBuffer());
      if(buffer.byteLength>2000000)throw new Error("官方頁面資料量超出可讀取範圍。");
      const charset=response.headers.get("content-type") || "";
      let raw=new TextDecoder(/shift[_-]?jis|sjis|cp932/i.test(charset)?"shift_jis":"utf-8").decode(buffer);
      if(/charset\s*=\s*["']?(?:shift[_-]?jis|sjis|cp932)/i.test(raw.slice(0,3000)))raw=new TextDecoder("shift_jis").decode(buffer);
      const $=cheerio.load(raw),rows:string[][]=[];
      $("tr").each((_,element)=>{
        const cells=$(element).children("th,td").map((_,cell)=>clean($(cell).clone().children("table").remove().end().text())).get();
        if(cells.length)rows.push(cells);
      });
      const firstTitle=rows.find(row=>row.length===1 && /\d{4}[\/年-]/.test(row[0]))?.[0];
      const title=firstTitle || clean($("title").text()) || "TCG マイスター";
      return {raw,rows,title,checkedAt:new Date().toISOString()};
    });
  }
  const roundUrl=(tid:string,round:number,page=1)=>`https://${HOST}/tourround.asp?tid=${tid}&kno=${round}&Page=${page}&Sort=Number&Order=&znt=${round===9999999?1:0}`;
  async function allPages(tid:string,round:number,first:any) {
    const pages=[...first.raw.matchAll(/\bPage=(\d+)/gi)].map(m=>Number(m[1]));
    const max=Math.max(1,...pages);
    if(max>MAX_PAGES)throw new Error("活動超過 100 頁，暫時無法完整讀取。");
    const results:any[]=new Array(max);results[0]=first;let next=2;
    await Promise.all(Array.from({length:Math.min(4,max-1)},async()=>{
      while(next<=max){const page=next++;results[page-1]=await html(roundUrl(tid,round,page));}
    }));
    if(max>1) {
      const seen=new Set<string>();
      for(const page of results) {
        const ids=page.rows.filter((row:string[])=>/^\d+$/.test(clean(row[0]))).map((row:string[])=>row.map(cell=>/\btw\d+\b/i.exec(cell)?.[0].toLowerCase()).find(Boolean)).filter(Boolean);
        if(!ids.length)throw new Error("官方配對分頁尚未完整，請重新讀取。");
        for(const id of ids){if(seen.has(id))throw new Error("分頁有重複玩家，請重新讀取。");seen.add(id);}
      }
    }
    // Never silently accept a partial dataset if pagination changes while reading.
    for(const page of results){const links=[...page.raw.matchAll(/\bPage=(\d+)/gi)].map(m=>Number(m[1]));if(links.some(n=>n>max))throw new Error("官方配對頁正在更新頁數，請重新讀取。");}
    return results.flatMap(page=>page.rows);
  }
  async function final(tid:string,playerId:string) {
    const first=await html(roundUrl(tid,9999999));
    const hasHeader=first.rows.some((row:string[])=>row.some(cell=>/^rank$/i.test(clean(cell))));
    if(!hasHeader)return {ok:true,type:"final",available:false,tid,source_url:roundUrl(tid,9999999),checked_at:first.checkedAt};
    const standings=parseStandings(await allPages(tid,9999999,first));
    return {ok:true,type:"final",available:standings.length>0,tid,title:first.title,standing_count:standings.length,standing:standings.find((p:any)=>p.id===playerId)||null,source_url:roundUrl(tid,9999999),checked_at:first.checkedAt};
  }
  async function snapshot(tid:string,selection:string|number,total:number) {
    const main=await html(`https://${HOST}/tour.asp?tid=${tid}`);
    const rounds=[...new Set([...main.raw.matchAll(/\bkno=(\d+)/gi)].map(m=>Number(m[1])).filter(n=>n>=1 && n<=20))].sort((a,b)=>a-b);
    const candidates=selection==="auto"?rounds.filter(n=>n<=total).reverse():[Number(selection)];
    if(!candidates.length)throw new Error("目前尚未有已公布的配對。稍後再按更新即可。");
    let selected=0,entries:any[]=[],first:any;
    for(const round of candidates) {
      if(!Number.isInteger(round)||round<1||round>total)throw new Error("查詢 Round 必須在總輪數範圍內。");
      first=await html(roundUrl(tid,round));
      const initial=parseRoundRows(first.rows,round);
      if(!initial.length){if(selection!=="auto")throw new Error(`Round ${round} 尚未公布。`);continue;}
      entries=parseRoundRows(await allPages(tid,round,first),round);selected=round;break;
    }
    if(!selected)throw new Error("目前配對尚未公布，請稍後再更新。");
    if(entries.length>4096)throw new Error("參賽人數超過本功能目前支援的 4096 人。");
    const data=buildSnapshot(entries,selected);
    return {ok:true,type:"snapshot",tid,title:first.title||main.title,rounds,source_url:roundUrl(tid,selected),checked_at:first.checkedAt,snapshot:data};
  }
  return {snapshot,final};
}
