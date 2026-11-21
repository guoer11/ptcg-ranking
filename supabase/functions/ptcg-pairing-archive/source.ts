import * as cheerio from "npm:cheerio@1.0.0";

const HOST = "tcg.sfc-jpn.jp";
const LIMIT_PAGES = 80;
const ID = /\btw\d{6,12}\b/i;
const clean = (value:unknown) => String(value ?? "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const idOf = (text:unknown) => ID.exec(clean(text))?.[0].toLowerCase() || "";
// Meister's TtlScore is a numeric value in the cell following each player's ID.
// It is *not* a wins/losses/ties record. Never infer match results from this value.
const ttlScoreAfterId = (cells:string[],id:string):number|null => {
  const at=cells.findIndex(c=>idOf(c)===id);
  if(at<0)return null;
  for(let i=at+1;i<cells.length;i++) {
    if(idOf(cells[i]))break;
    const raw=clean(cells[i]);
    if(/^-?\d+(?:\.\d+)?$/.test(raw))return Number(raw);
  }
  return null;
};
const nameOf = (cell:string,id:string) =>
  clean(cell.replace(new RegExp(id,"ig"),"")
    .replace(/\(?\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s*\(\d+\)\s*\)?/g,"")
    .replace(/\(\s*\)/g,""));

export const validTid = (s:string) => /^\d{1,12}$/.test(s) && s !== "3000442";
export function sourceTid(raw:string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" || u.hostname!==HOST || u.port || u.username || u.password
      || !/^\/tour(?:round)?\.asp$/i.test(u.pathname)) throw new Error("只接受 TCG Meister 的官方賽事網址");
  const tid=u.searchParams.get("tid")||"";
  if (!validTid(tid)) throw new Error("TID 無效或為測試賽事");
  return tid;
}
const pageUrl=(tid:string,round:number,page=1,standings=false)=>
  `https://${HOST}/tourround.asp?tid=${tid}&kno=${round}&Page=${page}&Sort=Number&Order=&znt=${standings||round===9999999?1:0}`;
export const officialUrl=(tid:string)=>`https://${HOST}/tour.asp?tid=${tid}`;

async function load(url:string) {
  let next=url;
  let response:Response | null=null;
  for (let i=0;i<4;i++) {
    const u=new URL(next);
    if (u.protocol!=="https:" || u.hostname!==HOST || u.port || u.username || u.password
        || !/^\/tour(?:round)?\.asp$/i.test(u.pathname)) throw new Error("官方來源轉址不符合預期");
    response=await fetch(next,{redirect:"manual",headers:{
      "User-Agent":"Mozilla/5.0 (compatible; PTCG-Ranking-Archive/2.10; +https://guoer11.github.io/ptcg-ranking/)",
      "Accept":"text/html","Cache-Control":"no-cache"
    },signal:AbortSignal.timeout(14000)});
    if (response.status>=300 && response.status<400) {
      const location=response.headers.get("location");
      if (!location)throw new Error("官方來源轉址缺少網址");
      next=new URL(location,next).toString();continue;
    }
    break;
  }
  if(!response?.ok)throw new Error(`official HTTP ${response?.status||"unknown"}`);
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length>2_000_000)throw new Error("官方單頁超過 2 MB");
  const charset=response.headers.get("content-type")||"";
  let raw=new TextDecoder(/shift[_-]?jis|sjis|cp932/i.test(charset)?"shift_jis":"utf-8").decode(data);
  if(/charset\s*=\s*["']?(?:shift[_-]?jis|sjis|cp932)/i.test(raw.slice(0,3000)))
    raw=new TextDecoder("shift_jis").decode(data);
  const $=cheerio.load(raw);
  const rows:string[][]=[];
  $("tr").each((_,el)=>{
    const cells=$(el).children("th,td").map((_,c)=>clean($(c).clone().children("table").remove().end().text())).get();
    if(cells.length)rows.push(cells);
  });
  return {raw,rows,title:clean($("title").text()).slice(0,200),url:next};
}
function pageCount(raw:string,tid:string,round:number) {
  const matches=[...raw.matchAll(/(?:tourround\.asp\?[^"'<\s]*?)?\bPage=(\d+)/gi)].map(m=>Number(m[1]));
  const max=Math.max(1,...matches.filter(n=>Number.isInteger(n)));
  if(max>LIMIT_PAGES)throw new Error("頁數超過備份上限，拒絕不完整備份");
  return max;
}
async function allPages(tid:string,round:number,standings=false) {
  const first=await load(pageUrl(tid,round,1,standings));
  const max=pageCount(first.raw,tid,round);
  const pages=Array.from({length:max},()=>null as Awaited<ReturnType<typeof load>>|null);
  pages[0]=first;
  let next=2;
  await Promise.all(Array.from({length:Math.min(3,max-1)},async()=>{
    while(next<=max) {
      const page=next++;
      pages[page-1]=await load(pageUrl(tid,round,page,standings));
    }
  }));
  if(pages.some(p=>!p))throw new Error("官方分頁無法完整讀取");
  for(const page of pages) {
    if(pageCount(page!.raw,tid,round)>max)throw new Error("擷取期間官方頁數改變");
  }
  return {rows:pages.flatMap(p=>p!.rows),title:first.title,page_count:max};
}
function parseRows(rows:string[][]) {
  const tables=new Map<string,Map<string,{id:string;name:string;record:{points:number}|null;opponent:string;opponentRecord:{points:number}|null}>>();
  const seenAcross=new Map<string,string>();
  let bye=0;
  for(const cells of rows) {
    const table=clean(cells[0]);
    if(!/^\d{1,5}$/.test(table) && !/^bye|輪空$/i.test(table))continue;
    const idCell=cells.slice(1).find(c=>idOf(c));
    if(!idCell)continue;
    const id=idOf(idCell);
    const ids=[...new Set(cells.slice(1).flatMap(c=>[...c.matchAll(/\btw\d{6,12}\b/ig)].map(m=>m[0].toLowerCase())))];
    const other=ids.find(x=>x!==id)||"";
    const score=ttlScoreAfterId(cells,id);
    const opponentScore=other?ttlScoreAfterId(cells,other):null;
    const group=tables.get(table)||new Map();
    const row={id,name:nameOf(idCell,id),
      record:score===null?null:{points:score},
      opponent:other,opponentRecord:opponentScore===null?null:{points:opponentScore}};
    if(group.has(id)) {
      const old=group.get(id)!;
      if(old.opponent && other && old.opponent!==other)throw new Error("配對內容正在變動");
      if(!old.record&&row.record)old.record=row.record;
      if(!old.opponentRecord&&row.opponentRecord)old.opponentRecord=row.opponentRecord;
    } else {
      if(seenAcross.has(id)&&seenAcross.get(id)!==table)throw new Error("同一玩家出現於不同桌");
      seenAcross.set(id,table);group.set(id,row);
    }
    tables.set(table,group);
  }
  const matches:any[]=[];
  for(const [table,group] of tables) {
    const playerRows=[...group.values()];
    if(/^(?:bye|輪空)$/i.test(table)) {
      for(const player of playerRows)matches.push({table:"Bye",
        a:{id:player.id,name:player.name,record:player.record},b:null,kind:"bye"});
      bye+=playerRows.length;
      continue;
    }
    if(playerRows.length>2)throw new Error("單桌多於兩位選手，需重新擷取");
    const a=playerRows[0];
    if(!a)continue;
    const b=playerRows[1] || (a.opponent
      ? {id:a.opponent,name:"",record:a.opponentRecord,opponent:a.id,opponentRecord:a.record} : null);
    matches.push({table:Number(table),a:{id:a.id,name:a.name,record:a.record},
      b:b?{id:b.id,name:b.name,record:b.record}:null,
      kind:b?"match":"unpaired"});
  }
  matches.sort((a,b)=>(Number(a.table)||999999)-(Number(b.table)||999999));
  if(!matches.length) return {matches:[],player_count:0,table_count:0};
  // Most tournaments expose one row for each opponent. Do not treat a partly
  // published/partly paginated table as a complete permanent snapshot.
  const distinct=new Set(matches.flatMap(m=>[m.a.id,m.b?.id].filter(Boolean)));
  if(distinct.size<seenAcross.size-bye)throw new Error("配對頁疑似不完整");
  return {matches,player_count:distinct.size,table_count:matches.length};
}
export const parseMatchRows = parseRows;
export async function publishedRounds(tid:string) {
  const event=await load(officialUrl(tid));
  const rounds=[...new Set([...event.raw.matchAll(/\bkno=(\d+)/gi)]
    .map(m=>Number(m[1])).filter(n=>Number.isInteger(n)&&n>=1&&n<=40))].sort((a,b)=>a-b);
  const interimRounds=[...new Set([...event.raw.matchAll(/href=["']([^"']*tourround\.asp\?[^"']+)["']/gi)]
    .map(m=>m[1].replace(/&amp;/gi,"&"))
    .map(ref=>{try {const u=new URL(ref,"https://"+HOST+"/");
      return u.hostname===HOST && u.searchParams.get("tid")===tid
        && u.searchParams.get("znt")==="1" ? Number(u.searchParams.get("kno")) : 0;
    } catch {return 0;}})
    .filter(n=>Number.isInteger(n)&&n>=1&&n<=40))].sort((a,b)=>a-b);
  return {rounds,interimRounds,title:event.title};
}
export async function captureRound(tid:string,round:number) {
  const page=await allPages(tid,round);
  const parsed=parseRows(page.rows);
  if(!parsed.matches.length) return null;
  return {tid,round_no:round,source_url:pageUrl(tid,round),
    page_count:page.page_count,...parsed};
}
function standingsFromRows(rows:string[][]) {
  const header=rows.some(c=>c.some(t=>/^(rank|排名|順位|名次)$/i.test(clean(t))));
  if(!header)return [];
  const standings:any[]=[];const seen=new Set<string>();
  for(const cells of rows) {
    const rank=Number(clean(cells[0]));
    if(!Number.isInteger(rank)||rank<1||rank>100000)continue;
    const idCell=cells.slice(1).find(c=>idOf(c));
    if(!idCell)continue;
    const id=idOf(idCell);
    if(seen.has(id))throw new Error("排名資料有重複玩家，請稍後重試");
    seen.add(id);
    const after=cells.slice(cells.indexOf(idCell)+1);
    const points=after.map(t=>/^\\d+$/.test(clean(t))?Number(clean(t)):null).find(v=>v!==null);
    standings.push({rank,id,name:nameOf(idCell,id),points:points??null});
  }
  return standings.sort((a,b)=>a.rank-b.rank);
}
export async function captureInterim(tid:string,round:number) {
  if(!Number.isInteger(round)||round<1||round>40)throw new Error("暫定排名輪次不合法");
  const page=await allPages(tid,round,true);
  const isInterim=page.rows.some(row=>row.some(cell=>/end\\s+of\\s+round\\s*\\d+\\s+interim\\s+result|interim\\s+(?:results?|standings?)/i.test(cell)));
  if(!isInterim)return null;
  const standings=standingsFromRows(page.rows);
  if(!standings.length)return null;
  return {tid,round_no:round,source_url:pageUrl(tid,round,1,true),
    page_count:page.page_count,player_count:standings.length,standings};
}
export async function captureFinal(tid:string) {
  const page=await allPages(tid,9999999,true);
  const standings=standingsFromRows(page.rows);
  if(!standings.length)return null;
  return {tid,source_url:pageUrl(tid,9999999,1,true),player_count:standings.length,
    page_count:page.page_count,standings};
}
export async function fingerprint(data:unknown) {
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
