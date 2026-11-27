// Parse only public official event-result rows and recipe text lists.
export const ORIGIN="https://asia.pokemon-card.com";
export const validEvent=(s:string)=>/^[0-9]{1,12}$/.test(s);
export const validCode=(s:string)=>/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(s);
function plain(html:string){
 return html.replace(/<[^>]*>/g," ").replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,x)=>{
  const known:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
  if(x[0]!=="#")return known[x.toLowerCase()]||"";
  const n=x[1]?.toLowerCase()==="x"?parseInt(x.slice(2),16):parseInt(x.slice(1),10);
  return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";
 }).replace(/\s+/g," ").trim();
}
export function parseEvent(html:string){
 // Div rows are the current Taiwan site. Table rows are a compatible fallback.
 const rows=[...html.split(/<div\b[^>]*class\s*=\s*["'][^"']*\btableRow\b[^"']*\btableData\b[^"']*["'][^>]*>/i).slice(1),...Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),m=>m[1])];
 const byPlayer=new Map<string,string>(),ambiguous=new Set<string>();
 for(const row of rows){
  // Never associate a deck with an adjacent player or ranking.
  const segment=row.split(/<\/section>|<\/article>|<\/main>/i)[0];
  const ids=[...new Set(Array.from(segment.matchAll(/\btw[0-9]{1,16}\b/gi),m=>m[0].toLowerCase()))];
  const codes=[...new Set(Array.from(segment.matchAll(/href\s*=\s*["'](?:https:\/\/asia\.pokemon-card\.com)?\/tw\/deck-build\/recipe\/([A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6})\/?["']/gi),m=>m[1]))];
  if(ids.length!==1||codes.length!==1)continue;
  const [id]=ids,[code]=codes;
  if(byPlayer.has(id)&&byPlayer.get(id)!==code)ambiguous.add(id);
  byPlayer.set(id,code);
 }
 return [...byPlayer].filter(([id])=>!ambiguous.has(id)).map(([player_id,code])=>({player_id,code}));
}
export function parseRecipe(html:string){
 const index=html.search(/<div\b[^>]*class\s*=\s*["'][^"']*\btextList\b[^"']*["'][^>]*>/i);
 if(index<0)throw Error("official recipe text list missing");
 const list=html.slice(index).split(/<\/section>/i)[0];
 const cards=[];
 for(const m of list.matchAll(/<li\b[^>]*class\s*=\s*["'][^"']*\bcard\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)){
  const row=m[1],label=row.match(/<p\b[^>]*class\s*=\s*["'][^"']*\bcardName\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const count=row.match(/<div\b[^>]*class\s*=\s*["'][^"']*\bcardCount\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if(!label||!count)throw Error("incomplete card row");
  const name=plain(label[1]),n=Number(plain(count[1]));
  const card_id=label[1].match(/\/tw\/card-search\/detail\/([0-9]+)\//i)?.[1]||"";
  const expansion=plain(row.match(/<span\b[^>]*class\s*=\s*["'][^"']*\bcardExpansion\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||"");
  const number=plain(row.match(/<span\b[^>]*class\s*=\s*["'][^"']*\bcardNumber\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||"");
  if(!name||name.length>160||!Number.isInteger(n)||n<1||n>60)throw Error("invalid card row");
  cards.push({name,count:n,card_id,expansion,number});
 }
 if(cards.reduce((sum,c)=>sum+c.count,0)!==60)throw Error("official recipe not 60 cards");
 return cards;
}
export function isPng(bytes:Uint8Array){return bytes.length>=32&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);}
