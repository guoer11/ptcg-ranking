(() => {
  'use strict';
  if(window.__ptcgHistoryKnockout)return;
  window.__ptcgHistoryKnockout=true;
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ENDPOINT='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-archive';
  const names=['champion','runner_up','semi_one','semi_two'];
  const labels=['冠軍 · 100 LP','亞軍 · 75 LP','四強 · 50 LP','四強 · 50 LP'];
  let current=null,eventId='',mapped=null,generation=0;
  let tournamentsCache=null,knockoutCache=null;

  async function publicJson(path){
    const response=await fetch(path+'?v='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('無法讀取 '+path);
    return response.json();
  }
  function status(message,failed=false){
    const el=$('historyKnockoutStatus');
    if(!el)return;
    el.textContent=message;
    el.dataset.error=failed?'1':'0';
  }
  function getTop(archive){
    const rows=archive?.final?.standings;
    if(!Array.isArray(rows)||rows.length<9)return null;
    const top=rows.filter(row=>Number.isInteger(row.rank)&&row.rank>=1&&row.rank<=8)
      .sort((a,b)=>a.rank-b.rank);
    if(top.length!==8||new Set(top.map(p=>p.rank)).size!==8
      ||new Set(top.map(p=>String(p.id).toLowerCase())).size!==8)return null;
    return top;
  }
  function labelFor(row){
    const id=String(row.id||'').toLowerCase();
    const real=current?.context?.real_names?.[id];
    const name=real||row.name||id;
    return `預賽 ${row.rank} · ${name}${name===id?'':('（'+id+'）')}`;
  }
  function selected(){
    return names.map(name=>String($('historyKnockout_'+name)?.value||'').toLowerCase());
  }
  function drawPreview(){
    if(!current)return;
    const top=getTop(current)||[];
    const chosen=selected();
    const unique=chosen.every(Boolean)&&new Set(chosen).size===4;
    const ids=new Set(top.map(p=>String(p.id).toLowerCase()));
    const valid=unique&&chosen.every(id=>ids.has(id));
    $('historyKnockoutSave').disabled=!valid;
    const results=top.map(p=>{
      const id=String(p.id).toLowerCase(),at=chosen.indexOf(id);
      const finish=at===0?'冠軍':at===1?'亞軍':at>=2?'四強':'八強';
      const points=at===0?100:at===1?75:at>=2?50:25;
      return {p,finish,points};
    });
    $('historyKnockoutPreview').innerHTML=`<table><thead><tr><th>預賽名次</th><th>玩家</th><th>複賽成績</th><th>LP</th></tr></thead><tbody>
      ${results.map(({p,finish,points})=>`<tr><td>${p.rank}</td><td>${escape(current.context?.real_names?.[String(p.id).toLowerCase()]||p.name||p.id)}
        <small>${escape(p.id)}</small></td><td>${valid?finish:'尚未完成設定'}</td><td>${valid?points:'—'}</td></tr>`).join('')}
      </tbody></table>`;
    if(!valid)status('請從預賽前八名選出四位不重複的選手。其餘四位將自動成為八強。');
    else status('檢查通過：冠軍 1 位、亞軍 1 位、四強 2 位，其他 4 位自動八強。');
  }
  function savedSelections(results){
    if(!Array.isArray(results)||results.length!==8)return null;
    const champion=results.find(x=>x.final_rank===1)?.player_id;
    const runner=results.find(x=>x.final_rank===2)?.player_id;
    const semis=results.filter(x=>x.final_rank===3).map(x=>x.player_id);
    if(!champion||!runner||semis.length!==2)return null;
    return [champion,runner,...semis];
  }
  async function render(archive,tid){
    if(!pairingAuthorized)return;
    const panel=$('historyKnockoutPanel');
    if(!panel)return;
    const top=getTop(archive);
    const title=String(archive?.event?.title||'');
    if(!top||!/(UBL|高級球)/i.test(title)||!/(孩童|Junior)/i.test(title)
        ||!archive?.event?.final_seen_at){panel.hidden=true;current=null;eventId='';return;}
    // Do not overwrite the owner's unsaved selections when changing only the
    // viewed Round of the same archived event.
    if(current?.event?.tid===tid&&panel.dataset.ready==='1')return;
    const request=++generation;
    current=archive;eventId='';panel.hidden=true;panel.dataset.ready='0';
    try{
      const [sources,oldKnockout,tournaments]=await Promise.all([
        publicJson('data/preliminary_sources.json'),
        knockoutCache||publicJson('data/knockout_results.json'),
        tournamentsCache||publicJson('data/tournaments.json')
      ]);
      if(request!==generation)return;
      knockoutCache=oldKnockout;tournamentsCache=tournaments;
      const source=(sources.sources||[]).find(x=>String(x.tid)===String(tid)
        &&x.league==='Ultra'&&x.group==='Junior');
      if(!source){panel.hidden=true;return;}
      const match=(tournaments.events||[]).find(e=>String(e.event_id)===String(source.event_id)
        &&e.league==='Ultra'&&e.group==='Junior');
      if(!match){panel.hidden=true;return;}
      eventId=String(source.event_id);
      const configured=archive.knockout?.podium?.results
        ||oldKnockout.events?.[eventId]?.results||[];
      const initial=savedSelections(configured)||['','','',''];
      const options='<option value="">請選擇選手</option>'+top.map(row=>
        `<option value="${escape(String(row.id).toLowerCase())}">${escape(labelFor(row))}</option>`).join('');
      $('historyKnockoutForm').innerHTML=names.map((name,i)=>
        `<label for="historyKnockout_${name}">${labels[i]}<select class="search-input" id="historyKnockout_${name}">${options}</select></label>`).join('');
      names.forEach((name,i)=>{
        const select=$('historyKnockout_'+name);
        select.value=initial[i];
        select.addEventListener('change',drawPreview);
      });
      panel.dataset.ready='1';panel.hidden=false;
      drawPreview();
      if(match.results?.length){
        status('官方正式成績已公布：試算一律使用官方資料，這裡的複賽名次僅供歷史紀錄。');
      }else if(configured.length===8){
        status('已載入先前儲存的複賽成績，可修改後重新儲存。');
      }
    }catch(e){
      panel.hidden=false;status('讀取八強設定失敗：'+String(e.message||e),true);
    }
  }
  async function save(){
    if(!pairingAuthorized||!pairingSession?.access_token||!current||!eventId)return;
    const [champion,runner_up,semi_one,semi_two]=selected();
    const valid=[champion,runner_up,semi_one,semi_two].every(Boolean)
      &&new Set([champion,runner_up,semi_one,semi_two]).size===4;
    if(!valid)return;
    $('historyKnockoutSave').disabled=true;
    status('正在儲存複賽成績並觸發試算同步…');
    try{
      const response=await fetch(ENDPOINT,{method:'POST',cache:'no-store',headers:{
        Authorization:'Bearer '+pairingSession.access_token,
        'Content-Type':'application/json'
      },body:JSON.stringify({action:'save-knockout',
        tid:String(current.event.tid),event_id:eventId,
        champion,runner_up,semifinalists:[semi_one,semi_two]})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'成績儲存失敗');
      if(data.sync_triggered)status('複賽成績已儲存，本站試算同步已啟動；官方正式成績仍優先。');
      else status('複賽成績已儲存，但試算同步未啟動：'+(data.sync_error||'請稍後再試'),true);
    }catch(e){status('儲存失敗：'+String(e.message||e),true);}
    finally{if($('historyKnockoutSave'))$('historyKnockoutSave').disabled=false;}
  }
  document.addEventListener('archive:loaded',event=>{
    const archive=event.detail?.archive,tid=event.detail?.tid;
    if(archive&&tid)void render(archive,tid);
  });
  document.addEventListener('pairing:auth-ready',e=>{
    if(!e.detail?.allowed){generation++;current=null;eventId='';
      const el=$('historyKnockoutPanel');if(el)el.hidden=true;}
  });
  document.addEventListener('DOMContentLoaded',()=>{
    $('historyKnockoutSave')?.addEventListener('click',()=>{void save();});
  },{once:true});
})();
