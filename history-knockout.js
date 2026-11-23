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
  // 七場固定籤位；不從既有冠亞軍名次反向猜測個別對戰勝負。
  const bracketGames=[
    {key:'qf1',stage:'qf',label:'八強 ①',seeds:[1,8]},
    {key:'qf2',stage:'qf',label:'八強 ②',seeds:[4,5]},
    {key:'qf3',stage:'qf',label:'八強 ③',seeds:[3,6]},
    {key:'qf4',stage:'qf',label:'八強 ④',seeds:[2,7]},
    {key:'sf1',stage:'sf',label:'四強 ①',from:['qf1','qf2']},
    {key:'sf2',stage:'sf',label:'四強 ②',from:['qf3','qf4']},
    {key:'final',stage:'final',label:'冠軍決賽',from:['sf1','sf2']}
  ];
  const bracketKeys=bracketGames.map(game=>game.key);
  let bracketWinners={},bracketDirty=false,bracketStage='qf',bracketBusy=false;
  function bracketCount(){return bracketKeys.filter(key=>Boolean(bracketWinners[key])).length;}
  function bracketPlayer(id){
    const row=(getTop(current)||[]).find(p=>String(p.id).toLowerCase()===id);
    // Only this event's recorded deck; never substitute a previous-event deck.
    const recorded=String(current?.context?.decks?.[id]?.current?.deck||'').trim();
    return row?{id,rank:row.rank,name:String(current?.context?.real_names?.[id]||row.name||id),
      deck:recorded}:null;
  }
  function bracketSlots(game) {
    if(game.seeds){
      const top=getTop(current)||[];
      return game.seeds.map(seed=>{
        const row=top.find(p=>p.rank===seed);
        return {id:row?String(row.id).toLowerCase():'',hint:'第'+seed+'名'};
      });
    }
    return game.from.map((from,i)=>({id:bracketWinners[from]||'',
      hint:({qf1:'八強①',qf2:'八強②',qf3:'八強③',qf4:'八強④',sf1:'四強①',sf2:'四強②'}[from]||from)+' 勝者'}));
  }
  function bracketOption(game,slot) {
    const player=slot.id?bracketPlayer(slot.id):null;
    const selected=!!player&&bracketWinners[game.key]===slot.id;
    const eliminated=!!bracketWinners[game.key]&&!!player&&!selected;
    const cls='history-bracket-pick'+(selected?' is-winner':'')+(eliminated?' is-eliminated':'')+
      (!player?' is-unavailable':'');
    // Text stays outside buttons so Chrome and iOS can select just the name or PTCG ID.
    const action=player
      ?'<button type="button" class="history-bracket-result" data-bracket-pick="'+game.key+
       '" data-player-id="'+escape(slot.id)+'" aria-pressed="'+String(selected)+'">'+
       (selected?'✓ 晉級':(eliminated?'淘汰':'選為勝者'))+'</button>'
      :'<span class="history-bracket-result is-pending">待確認</span>';
    return '<div class="'+cls+'">'+
      '<div class="history-bracket-pick-main">'+
      '<span class="history-bracket-seed">'+escape(slot.hint)+'</span>'+
      '<span class="history-bracket-player-line"><strong class="history-bracket-copytext">'+escape(player?player.name:'待確認')+'</strong>'+
      (player?.deck?'<span class="history-bracket-deck history-bracket-copytext" title="本場已記錄牌組（不代表逐輪確認）">'+escape(player.deck)+'</span>':'')+
      '</span>'+
      (player?'<small class="history-bracket-copytext">'+escape(player.id)+'</small>':'')+
      '</div>'+action+'</div>';
  }
  function bracketMatch(game){
    const slots=bracketSlots(game),selected=bracketWinners[game.key]||'';
    return '<div class="history-bracket-match"><div class="history-bracket-match-title"><span>'+
      escape(game.label)+'</span><span>'+(selected?'勝者已確認':'尚未確認')+'</span></div>'+
      slots.map(slot=>bracketOption(game,slot)).join('')+'</div>';
  }
  function bracketStatus(message,failed=false){
    const el=$('historyBracketStatus');
    if(el){el.textContent=message;el.dataset.error=failed?'1':'0';}
  }
  function drawBracket(){
    const root=$('historyKnockoutBracket'),saveBtn=$('historyBracketSave');
    if(!root||!current)return;
    const stages=[['qf','八強'],['sf','四強'],['final','決賽']];
    const count=bracketCount(),winner=bracketPlayer(bracketWinners.final||'');
    root.innerHTML=
      '<div class="history-bracket-head"><strong class="history-bracket-progress">已確認 '+count+' / 7 場</strong>'+
      '<span class="history-bracket-notice">姓名與 PTCG ID 可直接選取複製；按「選為勝者」確認戰況，再按一次取消。變更上一輪會清除不符合的後續結果。</span></div>'+
      '<div class="history-bracket-tabs" aria-label="切換複賽輪次">'+stages.map(stage=>
        '<button type="button" class="history-bracket-tab'+(bracketStage===stage[0]?' active':'')+
        '" data-bracket-stage="'+stage[0]+'" aria-pressed="'+String(bracketStage===stage[0])+'">'+stage[1]+'</button>'
      ).join('')+'</div>'+
      '<div class="history-bracket-columns">'+stages.map(stage=>
        '<section class="history-bracket-stage'+(bracketStage===stage[0]?' is-mobile-active':'')+'">'+
        '<h4>'+stage[1]+'</h4><div class="history-bracket-matches">'+
        bracketGames.filter(game=>game.stage===stage[0]).map(bracketMatch).join('')+
        '</div></section>'
      ).join('')+'</div>'+
      (winner?'<div class="history-bracket-champion">🏆 冠軍：'+escape(winner.name)+'（預賽第'+winner.rank+'名）</div>':'');
    const legacy=$('historyKnockoutLegacy');
    if(legacy)legacy.hidden=count>0;
    if(saveBtn){saveBtn.disabled=bracketBusy||!bracketDirty;saveBtn.textContent=bracketBusy?'儲存中…':'儲存目前戰況';}
    if(bracketDirty&&$('historyBracketStatus')?.dataset.error!=='1')bracketStatus(count===7
      ?'尚未儲存：七場已填完，儲存後會同步冠亞軍、四強與 LP。'
      :'尚未儲存：已確認 '+count+' / 7 場；不完整戰況只會保存，不會更新 LP。');
  }
  function updateBracketWinner(key,id){
    const game=bracketGames.find(g=>g.key===key);
    if(!game||bracketBusy||!id||!bracketSlots(game).some(slot=>slot.id===id))return;
    bracketWinners[key]=bracketWinners[key]===id?'':id;
    // 上游勝者改變時，只清空受影響的四強或決賽結果。
    for(const later of bracketGames.slice(4)){
      const slots=bracketSlots(later).map(slot=>slot.id);
      if(bracketWinners[later.key]&&!slots.includes(bracketWinners[later.key]))
        bracketWinners[later.key]='';
    }
    bracketDirty=true;
    bracketStatus('',false);
    drawBracket();
  }
  async function saveBracket(){
    if(bracketBusy||!bracketDirty||!pairingAuthorized||!pairingSession?.access_token||!eventId||!current)return;
    const targetTid=String(current.event.tid),targetEvent=eventId;
    const currentWinners=Object.fromEntries(bracketKeys.map(k=>[k,bracketWinners[k]||'']));
    bracketBusy=true;drawBracket();bracketStatus('正在儲存已確認的複賽戰況…');
    try{
      const response=await fetch(ENDPOINT,{method:'POST',cache:'no-store',headers:{
        Authorization:'Bearer '+pairingSession.access_token,'Content-Type':'application/json'
      },body:JSON.stringify({action:'save-knockout-bracket',tid:targetTid,
        event_id:targetEvent,winners:currentWinners})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'儲存失敗');
      if(String(current?.event?.tid)!==targetTid)return;
      bracketDirty=false;
      if(data.complete){
        bracketStatus(data.sync_triggered
          ?'七場戰況已儲存，冠亞軍及 LP 試算同步已啟動。官方成績仍優先。'
          :'戰況已儲存，但積分試算同步失敗：'+(data.sync_error||'請稍後再試'),!data.sync_triggered);
      }else bracketStatus('已儲存 '+data.confirmed+' / 7 場；其餘保留待確認，不會推測勝負。');
    }catch(e){bracketStatus('儲存失敗：'+String(e.message||e),true);}
    finally{bracketBusy=false;drawBracket();}
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
      // 先載入逐場手動記錄；既有名次不能用來推算任何一場的勝者。
      bracketWinners=Object.fromEntries(bracketKeys.map(k=>[
        k,String(archive.knockout?.podium?.bracket?.winners?.[k]||'').toLowerCase()
      ]));
      bracketDirty=false;bracketStage='qf';bracketBusy=false;
      panel.dataset.ready='1';panel.hidden=false;
      drawPreview();drawBracket();
      if(!bracketCount()&&configured.length===8)
        bracketStatus('已保留原本登錄的冠亞軍名次，但缺少逐場勝負；請從八強開始手動確認，系統不會倒推。');
      else bracketStatus('戰況已載入：目前確認 '+bracketCount()+' / 7 場。');
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
    $('historyBracketSave')?.addEventListener('click',()=>{void saveBracket();});
    $('historyKnockoutBracket')?.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.bracketStage){
        bracketStage=button.dataset.bracketStage;drawBracket();return;
      }
      if(button.dataset.bracketPick)updateBracketWinner(button.dataset.bracketPick,button.dataset.playerId);
    });
  },{once:true});
})();
