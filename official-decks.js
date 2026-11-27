(() => {
'use strict';
if(window.PTCGOfficialDecks)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validCode=s=>/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(s||'');
const validId=s=>/^tw\d{1,16}$/.test(s||'');
const columns='event_id,player_id,code,event_date,title,league,division,image_path,preview_path,captured_at,deck_name,label_source,override_catalog_id';
const tournamentAccess=()=>typeof tournamentDeckAccess==='function'?tournamentDeckAccess():null;
const client=()=>tournamentAccess()?.client||(typeof pairingClient!=='undefined'?pairingClient:null);
const uid=()=>{const t=tournamentAccess();if(t)return ['admin','guest'].includes(t.role)?t.user:'';return typeof pairingSession!=='undefined'&&typeof pairingAuthorized!=='undefined'&&pairingAuthorized?String(pairingSession?.user?.id||''):'';};
const admin=()=>tournamentAccess()?tournamentAccess().role==='admin':typeof pairingAccessRole!=='undefined'&&pairingAccessRole==='admin';
const check=r=>{if(r.error)throw r.error;return r.data;};
const name=r=>r.deck_name||'尚未辨識';
const dateLabel=r=>{const date=String(r.event_date||'').slice(5).replace('-','/');const league={Ultra:'高級球',Master:'大師球',Great:'超級球',Premier:'紀念球'}[r.league]||'';const group={Junior:'孩童組',Senior:'少年組',Master:'大師組',Open:'全年齡組'}[r.division]||'';return [date,league+group].filter(Boolean).join(' ');};
const eventCache=new Map(),historyCache=new Map(),imageCache=new Map(),jobs=new WeakMap();
let cacheUser='',dialog=null;
function reset(){
 for(const url of imageCache.values())if(typeof url==='string')URL.revokeObjectURL(url);
 imageCache.clear();eventCache.clear();historyCache.clear();closeDialog();
 document.querySelectorAll('.official-deck-history').forEach(x=>x.remove());
 document.querySelectorAll('[data-official-player]').forEach(x=>{x.textContent='—';});
}
function ensureUser(){const u=uid();if(u!==cacheUser){reset();cacheUser=u;}return u;}
function closeDialog(){if(dialog){const d=dialog;dialog=null;d.close();d.remove();}}
function ensureCss(){
 if(document.getElementById('officialDeckCss'))return;
 const link=document.createElement('link');link.id='officialDeckCss';link.rel='stylesheet';link.href='official-decks.css?v=3.5.0';document.head.append(link);
}
function fetchCached(map,key,fn){
 const old=map.get(key);if(old&&Date.now()-old.at<60000)return old.promise;
 const promise=Promise.resolve().then(fn).catch(e=>{if(map.get(key)?.promise===promise)map.delete(key);throw e;});
 map.set(key,{at:Date.now(),promise});
 if(map.size>50)map.delete(map.keys().next().value);
 return promise;
}
async function mapping(tid,c){
 if(!/^\d+$/.test(String(tid||'')))return null;
 return check(await c.from('official_deck_event_map').select('event_id,official_deck_events(event_date)').eq('tid',String(tid)).maybeSingle());
}
function parseDate(title){
 const d=String(title||'').match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
 if(!d)return '';
 const year=Number(d[1]),month=Number(d[2]),day=Number(d[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):'';
}
async function archivedRows(tid,c){
 const m=await mapping(tid,c);
 if(!m)return {mapped:false,rows:[]};
 return eventRows(m.event_id,c);
}
async function eventRows(eventId,c){
 if(!/^\d{1,12}$/.test(String(eventId)))return {mapped:false,rows:[]};
 const rows=[];
 for(let from=0;from<10000;from+=500){
  const part=check(await c.from('official_deck_index').select(columns).eq('event_id',String(eventId)).order('player_id').range(from,from+499))||[];
  rows.push(...part);if(part.length<500)break;
 }
 return {mapped:true,rows};
}
async function latestRow(tid,title,id,c){
 const m=await mapping(tid,c);
 const date=m?.official_deck_events?.event_date||parseDate(title);
 if(!date)return {unknownDate:true,row:null};
 // Never use a same-day/future recipe as historical scouting.
 const rows=check(await c.from('official_deck_index').select(columns).eq('player_id',id).lt('event_date',date).order('event_date',{ascending:false}).order('event_id',{ascending:false}).limit(1))||[];
 return {row:rows[0]||null};
}
async function imageUrl(row,c,user){
 if(!validCode(row.code)||row.preview_path!==row.code+'.jpg')return '';
 const key=user+':'+row.code;
 if(imageCache.has(key))return await imageCache.get(key);
 const pending=(async()=>{
  const blob=check(await c.storage.from('official-deck-images').download(row.preview_path));
  if(uid()!==user||!blob||!blob.size)return '';
  const url=URL.createObjectURL(blob);
  if(imageCache.get(key)!==pending){URL.revokeObjectURL(url);return '';}
  imageCache.set(key,url);
  while(imageCache.size>25){const k=imageCache.keys().next().value,v=imageCache.get(k);if(typeof v==='string')URL.revokeObjectURL(v);imageCache.delete(k);}
  return url;
 })();
 imageCache.set(key,pending);
 try{return await pending;}catch(e){if(imageCache.get(key)===pending)imageCache.delete(key);throw e;}
}
function deckButton(r,onOpen){
 const button=document.createElement('button');button.type='button';button.className='official-deck-button';
 button.innerHTML='<strong>'+esc(name(r))+'</strong><small>'+(r.captured_at?'查看牌組 ›':'封存中 ›')+'</small>';
 button.onclick=onOpen;
 return button;
}
async function renderArchive(root,tid){return renderCells(root,'tid:'+tid,c=>archivedRows(tid,c));}
async function renderEvent(root,eventId){return renderCells(root,'event:'+eventId,c=>eventRows(eventId,c));}
async function renderCells(root,key,load){
 const user=ensureUser(),c=client();if(!user||!c||!root)return;
 const cells=[...root.querySelectorAll('[data-official-player]')];if(!cells.length)return;
 const job={};jobs.set(root,job);
 const valid=()=>uid()===user&&jobs.get(root)===job&&root.isConnected&&cells[0].isConnected;
 cells.forEach(cell=>{cell.textContent='…';});
 try{
  const result=await fetchCached(eventCache,user+':'+key,()=>load(c));
  if(!valid())return;
  const byId=new Map(result.rows.map(r=>[r.player_id,r]));
  for(const cell of cells){
   const r=byId.get(cell.dataset.officialPlayer);
   cell.replaceChildren();
   if(r)cell.append(deckButton(r,()=>openDeck(r,c,user,admin())));
   else {cell.textContent='—';cell.title=result.mapped?'目前無已發現的官方牌組':'此封存賽事尚未確認官方活動對應';}
  }
 }catch(e){if(valid())cells.forEach(cell=>{cell.textContent='讀取失敗';cell.title=String(e.message||e);});}
}
async function showHistory(host,id,tid,title){
 const user=ensureUser(),c=client();id=String(id||'').toLowerCase();
 if(!user||!c||!host||!validId(id)||!tid)return;
 host.querySelector('.official-deck-history')?.remove();
 const panel=document.createElement('section');panel.className='official-deck-history';panel.innerHTML='<strong>歷史官方牌組</strong><small>正在查詢…</small>';host.append(panel);
 const valid=()=>uid()===user&&host.isConnected&&panel.isConnected;
 try{
  const data=await fetchCached(historyCache,user+':'+tid+':'+id+':'+title,()=>latestRow(tid,title,id,c));
  if(!valid())return;
  const r=data.row;
  if(!r){panel.innerHTML='<strong>歷史官方牌組</strong><small>'+ (data.unknownDate?'賽事日期待確認':'尚無已封存的官方牌組紀錄')+'</small>';return;}
  panel.innerHTML='<strong>歷史官方牌組</strong><b>'+esc(name(r))+'</b><small>'+esc(dateLabel(r))+'</small>';
  const button=deckButton(r,()=>openDeck(r,c,user,admin()));button.querySelector('strong')?.remove();panel.append(button);
  if(r.preview_path){
   try{const url=await imageUrl(r,c,user);if(!valid()||!url)return;
    const img=document.createElement('img');img.src=url;img.alt='官方完整牌組縮圖';img.loading='lazy';img.decoding='async';button.prepend(img);
    button.querySelector('small').textContent='點擊圖片查看完整牌組 ›';
   }catch(e){if(valid())button.querySelector('small').textContent='圖片讀取失敗，點擊查看牌表 ›';}
  }
 }catch(e){if(valid())panel.innerHTML='<strong>歷史官方牌組</strong><small>暫時無法讀取</small>';}
}
function newDialog(title){
 closeDialog();ensureCss();const d=document.createElement('dialog');dialog=d;d.className='official-deck-dialog';
 d.innerHTML='<header><h3>'+esc(title)+'</h3><button type="button" class="secondary-btn" data-close aria-label="關閉">✕</button></header><div class="official-deck-dialog-body"></div>';
 document.body.append(d);d.querySelector('[data-close]').onclick=closeDialog;d.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});d.showModal();return d;
}
async function openDeck(row,c,user,canEdit){
 if(!uid()||uid()!==user||!validCode(row.code))return;
 const d=newDialog('官方牌組'),body=d.querySelector('.official-deck-dialog-body');
 const valid=()=>dialog===d&&uid()===user;
 body.innerHTML='<p><b>'+esc(name(row))+'</b> · '+esc(dateLabel(row))+'</p><p>'+esc(row.player_id)+'</p><p data-msg role="status">正在讀取伺服器封存牌表…</p><div data-picture></div><div data-cards></div><p><a href="https://asia.pokemon-card.com/tw/deck-build/recipe/'+esc(row.code)+'/" target="_blank" rel="noopener noreferrer">前往官方原始牌組</a></p><div data-admin></div>';
 const msg=body.querySelector('[data-msg]');
 try{
  const recipe=check(await c.from('official_deck_recipes').select('cards,image_path,preview_path,captured_at').eq('code',row.code).maybeSingle());
  if(!valid())return;
  const cards=Array.isArray(recipe?.cards)?recipe.cards:[];
  msg.textContent=cards.length?'牌組明細已保存，完整圖片由官網提供。':'尚未完成伺服器封存，官方連結可能仍可開啟。';
  if(cards.length){
   const list=document.createElement('details');list.className='official-deck-cardlist';list.innerHTML='<summary>卡牌明細（'+cards.reduce((s,x)=>s+Number(x.count||0),0)+' 張）</summary><table><thead><tr><th>卡牌</th><th>編號</th><th>張數</th></tr></thead><tbody>'+cards.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc([x.expansion,x.number].filter(Boolean).join(' '))+'</td><td>'+esc(x.count)+'</td></tr>').join('')+'</tbody></table>';body.querySelector('[data-cards]').append(list);
  }
  const picture=body.querySelector('[data-picture]');picture.className='official-deck-picture';
  const img=document.createElement('img');img.alt='官方完整牌表';img.decoding='async';img.referrerPolicy='no-referrer';
  img.onclick=()=>picture.classList.toggle('zoomed');picture.append(img);
  const zoom=document.createElement('button');zoom.type='button';zoom.className='secondary-btn';zoom.textContent='放大／縮小';zoom.onclick=()=>picture.classList.toggle('zoomed');picture.after(zoom);
  img.onerror=async()=>{
   img.onerror=null;
   if(!valid())return;
   try{
    const url=await imageUrl({...row,preview_path:recipe?.preview_path},c,user);
    if(!valid())return;
    if(url){img.onerror=()=>{if(valid()){img.remove();zoom.remove();msg.textContent='圖片無法載入，仍可查看保存的卡牌明細。';body.querySelector('[data-cards] details')?.setAttribute('open','');}};img.src=url;img.alt='官方牌組 JPG 預覽圖';msg.textContent='官網原圖暫時無法讀取，顯示本站預覽圖。';return;}
   }catch(e){}
   if(valid()){img.remove();zoom.remove();msg.textContent='官網圖片已失效或暫時無法讀取，仍可查看保存的卡牌明細。';body.querySelector('[data-cards] details')?.setAttribute('open','');}
  };
  img.src='https://asia.pokemon-card.com/tw/deck-img/'+row.code+'.png';
  if(canEdit&&admin()&&valid()){
   const catalog=check(await c.from('pairing_deck_catalog').select('id,name').eq('user_id',user).order('sort_order'))||[];
   if(!valid())return;
   const el=body.querySelector('[data-admin]');el.innerHTML='<hr><label>手動修正官方牌組分類<select class="search-input"><option value="">使用自動辨識</option>'+catalog.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><button class="primary-btn" type="button">儲存分類</button><small role="status"></small>';
   const sel=el.querySelector('select'),save=el.querySelector('button'),status=el.querySelector('small');sel.value=String(row.override_catalog_id||'');
   save.onclick=async()=>{if(!valid()||!admin())return;save.disabled=true;
    try{
     const updated=check(await c.from('official_deck_entries').update({override_catalog_id:sel.value||null}).eq('event_id',row.event_id).eq('player_id',row.player_id).select('event_id'));
     if(!updated?.length)throw Error('沒有修改權限或紀錄已不存在');
     eventCache.clear();historyCache.clear();
     if(valid()){status.textContent='已儲存，重新查詢後套用。';body.querySelector('p b').textContent=sel.value?sel.selectedOptions[0].textContent:'使用自動辨識';}
     document.dispatchEvent(new CustomEvent('official-deck:changed'));
    }catch(e){if(valid())status.textContent=String(e.message||e);}finally{save.disabled=false;}
   };
  }
 }catch(e){if(valid())msg.textContent='牌表讀取失敗：'+String(e.message||e);}
}
async function openRules(c,item){
 if(!c||!item?.id)return;
 const d=newDialog('官方牌組辨識規則'),body=d.querySelector('.official-deck-dialog-body');
 const active=()=>dialog===d;
 body.innerHTML='<p><b>'+esc(item.name)+'</b></p><p>每行輸入官方完整卡牌名稱=最低張數。全部條件必須符合，平常使用自動判斷即可。</p><label>辨識條件<textarea rows="6" class="search-input" placeholder="多龍巴魯托ex=2&#10;黑夜魔靈=1"></textarea></label><fieldset class="official-deck-priority"><legend>辨識優先順序</legend><label><input type="radio" name="official-deck-priority" value="auto" checked><span>自動判斷（預設）<small>符合多個規則時，優先選擇不同卡名條件較多的牌組。</small></span></label><label><input type="radio" name="official-deck-priority" value="high"><span>優先辨識<small>符合此規則時，優先於一般自動辨識規則。</small></span></label><label><input type="radio" name="official-deck-priority" value="low"><span>最後辨識<small>沒有符合優先辨識或自動判斷的規則時才採用。</small></span></label></fieldset><p class="official-deck-priority-note">同一優先順序、相同條件數的不同牌組同時符合時，顯示「尚未辨識」，避免誤判。單一核心也可以使用自動判斷。</p><div class="official-deck-rule-actions"><button class="secondary-btn" type="button" data-delete>刪除規則</button><button class="primary-btn" type="button" data-save>儲存規則</button></div><p data-status role="status">讀取中…</p>';
 const textarea=body.querySelector('textarea'),priorities=[...body.querySelectorAll('input[name="official-deck-priority"]')],save=body.querySelector('[data-save]'),del=body.querySelector('[data-delete]'),status=body.querySelector('[data-status]');
 save.disabled=del.disabled=true;
 try{
  const rule=check(await c.from('official_deck_rules').select('required,priority_mode').eq('catalog_id',item.id).maybeSingle());
  if(!active())return;
  textarea.value=Object.entries(rule?.required||{}).map(([key,n])=>key+'='+n).join('\n');priorities.forEach(input=>{input.checked=input.value===(rule?.priority_mode||'auto');});
  status.textContent=rule?'已有辨識規則':'尚未設定辨識規則';save.disabled=false;del.disabled=!rule;
  save.onclick=async()=>{
   if(!active())return;
   const required=Object.create(null),lines=textarea.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   if(!lines.length||lines.length>20){status.textContent='請輸入 1 至 20 個條件。';return;}
   for(const line of lines){const m=line.match(/^(.{1,120})=([1-9][0-9]?)$/);if(!m||Number(m[2])>60||Object.prototype.hasOwnProperty.call(required,m[1].trim())){status.textContent='格式錯誤或重複卡名：'+line;return;}required[m[1].trim()]=Number(m[2]);}
   const mode=priorities.find(input=>input.checked)?.value||'auto';if(!['auto','high','low'].includes(mode)){status.textContent='請選擇辨識優先順序。';return;}
   save.disabled=del.disabled=true;
   try{check(await c.from('official_deck_rules').upsert({catalog_id:item.id,required,priority_mode:mode},{onConflict:'catalog_id'}));eventCache.clear();historyCache.clear();if(active()){status.textContent='已儲存，既有官方牌組會依新規則辨識。';del.disabled=false;}document.dispatchEvent(new CustomEvent('official-deck:changed'));}
   catch(e){if(active())status.textContent=String(e.message||e);}finally{save.disabled=false;}
  };
  del.onclick=async()=>{if(!active()||!confirm('刪除這個牌組的自動辨識規則？官方原始牌表與手動分類不會被刪除。'))return;
   save.disabled=del.disabled=true;try{check(await c.from('official_deck_rules').delete().eq('catalog_id',item.id));textarea.value='';priorities.forEach(input=>{input.checked=input.value==='auto';});status.textContent='已刪除辨識規則';eventCache.clear();historyCache.clear();document.dispatchEvent(new CustomEvent('official-deck:changed'));}catch(e){status.textContent=String(e.message||e);del.disabled=false;}finally{save.disabled=false;}
  };
 }catch(e){if(active())status.textContent='讀取失敗：'+String(e.message||e);}
}
ensureCss();
document.addEventListener('pairing:auth-ready',e=>{if(!e.detail?.allowed)reset();else ensureUser();});
document.addEventListener('pairing:role-changed',e=>{if(e.detail?.role==='none')reset();});
document.addEventListener('pairing:match-rendered',e=>{
 const d=e.detail,data=d?.data,host=document.querySelector('#pairingResult');
 if(host)void showHistory(host,d?.opponentId,data?.tid,data?.title);
});
document.addEventListener('pairing:multi-official-decks',e=>{
 const batch=e.detail?.batch,root=document.getElementById('pairingMultiResults');
 if(!root)return;
 root.querySelectorAll('[data-pairing-badge-role="opponent"]').forEach(el=>{const host=el.closest('.pairing-multi-card');if(host)void showHistory(host,el.dataset.pairingBadgeId,batch?.tid||batch?.results?.[0]?.tid,batch?.title||batch?.results?.[0]?.title);});
});
document.addEventListener('official-deck:changed',()=>{const root=document.getElementById('matchArchiveRows'),tid=document.getElementById('matchArchiveEvent')?.value;if(root&&tid)void renderArchive(root,tid);const modal=document.getElementById('tournamentModal'),eventId=modal?.dataset?.eventId;if(eventId&&modal.classList.contains('open'))void renderEvent(document.getElementById('tournamentModalBody'),eventId);});
window.PTCGOfficialDecks={renderArchive,renderEvent,showHistory,openRules,parseDate,clear:reset,close:closeDialog};
})();
