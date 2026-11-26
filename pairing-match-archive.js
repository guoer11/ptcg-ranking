(() => {
  "use strict";
  if(window.__ptcgMatchArchiveUi) return;
  window.__ptcgMatchArchiveUi=true;
  const URL_API="https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-archive";
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let archives=[],view=null,activeTid="",selectedRound="final";
  // Private, per-account in-memory cache only. Never persist archived player/deck
  // context in localStorage or share cached data across sign-ins.
  const archiveCache=new Map(),lastRoundByTid=new Map();
  const CACHE_MS=90*1000;
  const COMPLETED_CACHE_MS=5*60*1000;
  let archiveGeneration=0,loadedForUser="",refreshPromise=null;
  const token=()=>typeof pairingSession!=="undefined"&&pairingAuthorized?pairingSession?.access_token:null;
  async function api(action,extra={}) {
    const auth=token();
    if(!auth)throw new Error("請先登入即時配對授權帳號");
    const response=await fetch(URL_API,{method:"POST",headers:{
      "Authorization":"Bearer "+auth,"Content-Type":"application/json"
    },body:JSON.stringify({action,...extra}),cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||"封存服務回應失敗");
    return data;
  }
  const accountId=()=>String(pairingSession?.user?.id||"");
  const numericRound=value=>/^\d+$/.test(String(value||""))?Number(value):null;
  async function archiveGet(tid,round=null,{force=false}={}){
    const user=accountId();
    const key=user+":"+tid+":"+(round??"final");
    const cached=archiveCache.get(key);
    if(!force&&cached&&Date.now()-cached.at<(cached.archive?.event?.status==='completed'?COMPLETED_CACHE_MS:CACHE_MS))return cached.archive;
    const result=await api("get",{tid,round});
    // A response returned after sign-out must not populate another user's cache.
    if(user&&user===accountId()&&token())archiveCache.set(key,{at:Date.now(),archive:result.archive});
    return result.archive;
  }
  function useArchive(data,tid,round){
    view=data;
    selectedRound=String(round||"final");
    renderRows();
    if(data)document.dispatchEvent(new CustomEvent("archive:loaded",{detail:{archive:data,tid}}));
    message(data?.event?.last_error
      ?"部分備份曾讀取失敗；已取得的資料仍保留。"
      :"顯示本站封存資料（不需官方網站仍開放）。");
  }
  const message=(text,error=false)=>{if($("matchArchiveStatus")){$("matchArchiveStatus").textContent=text;$("matchArchiveStatus").dataset.error=error?"1":"0";}};
  const archiveTitle=a=>(a.title||"TCG Meister")+" · TID "+a.tid+
    (a.parent_tid?" (Day 2)":"")+" · "+(a.final_seen_at?"最終排名已封存":a.interim_round?"Round "+a.interim_round+" 暫定排名已封存":a.last_round?"Round "+a.last_round:"等待官方資料");
  const normalizedId=p=>String(p?.id||"").toLowerCase();
  const realName=p=>view?.context?.real_names?.[normalizedId(p)]||"";
  const deckInfo=p=>view?.context?.decks?.[normalizedId(p)]||{};
  const deckTerm=p=>[deckInfo(p)?.current?.deck,deckInfo(p)?.previous?.deck].filter(Boolean).join(" ");
  function currentMatchRows() {
    if(!view?.selected?.matches)return [];
    const term=$("matchArchiveSearch")?.value.trim().toLowerCase()||"";
    return view.selected.matches.filter(row=>[row.table,
      row.a?.name,row.a?.id,realName(row.a),deckTerm(row.a),
      row.b?.name,row.b?.id,realName(row.b),deckTerm(row.b)]
      .some(t=>String(t||"").toLowerCase().includes(term)));
  }
  function standingRows(source=view?.final) {
    const term=$("matchArchiveSearch")?.value.trim().toLowerCase()||"";
    return (source?.standings||[]).filter(row=>[
      row.rank,row.name,row.id,realName(row),deckTerm(row)
    ].some(t=>String(t||"").toLowerCase().includes(term)));
  }
  const shortDate=iso=>{
    const d=new Date(String(iso||""));
    return Number.isNaN(d.valueOf())?"":d.toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"});
  };
  const deckHTML=p=>{
    const deck=deckInfo(p);
    if(deck.current?.deck)return `<span class="archive-deck archive-deck-current"><b>本場已記錄牌組</b>${escape(deck.current.deck)}${deck.current.round?`<small>記錄於 Round ${escape(deck.current.round)}</small>`:""}</span>`;
    if(deck.previous?.deck)return `<span class="archive-deck archive-deck-history"><b>其他場歷史參考</b>${escape(deck.previous.deck)}
      <small>${escape(shortDate(deck.previous.date))} · TID ${escape(deck.previous.tid)}（非本場確認）</small></span>`;
    return "";
  };
  function editableDeckHTML(p){
    const id=normalizedId(p),markup=deckHTML(p);
    if(!/^tw\d+$/.test(id)||!pairingAuthorized)return markup||"—";
    return '<button class="archive-deck-edit" type="button" data-archive-edit-player="'+escape(id)+'" aria-label="修改本場牌組">'+(markup||'<span class="archive-deck archive-deck-empty">尚未記錄牌組</span>')+'<small class="archive-deck-edit-label"><span aria-hidden="true">✎</span><span class="archive-deck-edit-text">'+(deckInfo(p)?.current?.deck?'修改':'補登')+'</span></small></button>';
  }
  let editor=null;
  function closeDeckEditor(){if(editor){editor.close();editor.remove();editor=null;}}
  async function openDeckEditor(id){
    if(!token()||!activeTid||String(view?.event?.tid)!==activeTid||!/^tw\d+$/.test(id)||!pairingClient||!["final","interim"].includes(selectedRound))return;
    const tid=activeTid,uid=accountId(),p=(selectedRound==="final"?view?.final:view?.interim)?.standings?.find(row=>normalizedId(row)===id);
    if(!p)return;
    closeDeckEditor();
    const dialog=document.createElement("dialog");editor=dialog;dialog.className="archive-deck-dialog";
    dialog.innerHTML='<h3>修改本場牌組</h3><p>'+escape(realName(p)||p.name||id)+' · '+escape(id)+'</p><p class="archive-deck-editor-event">'+escape(view.event?.title||tid)+'</p><p data-editor-message role="status">正在讀取牌組清單…</p><div data-editor-controls hidden><label>牌組名稱<select class="search-input" data-editor-select></select></label><div class="archive-deck-dialog-actions"><button class="secondary-btn" type="button" data-editor-clear>清除本場牌組</button><button class="primary-btn" type="button" data-editor-save>儲存</button></div></div><button class="secondary-btn" type="button" data-editor-close>取消</button>';
    document.body.append(dialog);dialog.showModal();
    const msg=dialog.querySelector("[data-editor-message]"),select=dialog.querySelector("[data-editor-select]"),controls=dialog.querySelector("[data-editor-controls]"),save=dialog.querySelector("[data-editor-save]"),clear=dialog.querySelector("[data-editor-clear]"),cancel=dialog.querySelector("[data-editor-close]");
    let busy=false,revision="",pairCount=0;
    const valid=()=>editor===dialog&&token()&&accountId()===uid&&activeTid===tid;
    cancel.onclick=()=>{if(!busy)closeDeckEditor();};
    dialog.addEventListener("cancel",e=>{e.preventDefault();if(!busy)closeDeckEditor();});
    const rpc=async(action,deck=null)=>{const {data,error}=await pairingClient.rpc("edit_archived_player_deck",{p_tid:tid,p_player_id:id,p_action:action,p_deck:deck,p_revision:revision||null});if(error)throw error;return data;};
    async function submit(action){
      if(!valid()||busy)return;
      if(action==="save"&&!select.value){msg.textContent="請選擇牌組名稱。";return;}
      if(action==="clear"&&!confirm("確定清除這位玩家在本場的牌組？"+(pairCount?"另有 "+pairCount+" 桌相關雙牌組推估紀錄也會清除；其他玩家已確認的牌組不變。":"")+"（歷史異動仍保留）"))return;
      busy=true;save.disabled=clear.disabled=cancel.disabled=select.disabled=true;msg.textContent="正在儲存…";
      try{
        await rpc(action,action==="save"?select.value:null);
        archiveCache.clear();
        if(!valid())return;
        closeDeckEditor();
        document.dispatchEvent(new CustomEvent("archive:deck-updated",{detail:{tid,player_id:id}}));
        await choose(tid,true);
        if(accountId()===uid&&activeTid===tid)message(action==="clear"?"已清除本場牌組。":"已儲存本場牌組，統計與共用紀錄已更新。");
      }catch(e){if(valid())msg.textContent="操作失敗："+String(e.message||e);}
      finally{busy=false;save.disabled=clear.disabled=cancel.disabled=select.disabled=false;}
    }
    try{
      const data=await rpc("read");if(!valid())return;
      revision=data.revision;pairCount=Number(data.pair_count||0);
      const catalog=[...new Set(data.catalog||[])];
      select.innerHTML='<option value="">請選擇牌組</option>'+catalog.map(name=>'<option value="'+escape(name)+'">'+escape(name)+'</option>').join("");
      if(catalog.includes(data.deck))select.value=data.deck;
      msg.textContent=data.conflict?"目前有牌組衝突："+(data.alternatives||[]).join("／")+"，儲存將採用你選擇的牌組。":data.deck?"目前牌組："+data.deck:"尚未確認本場牌組。";
      controls.hidden=false;clear.disabled=!data.deck&&!pairCount;save.onclick=()=>submit("save");clear.onclick=()=>submit("clear");
    }catch(e){if(valid())msg.textContent="讀取失敗："+String(e.message||e);}
  }
  const playerHTML=(p,includeDeck=true)=>{
    if(!p)return "<span>輪空／未公布</span>";
    const id=normalizedId(p),real=realName(p),official=String(p.name||"");
    const primary=real||official||id;
    const deckMarkup=includeDeck?deckHTML(p):"";
    return `<div class="archive-player${deckMarkup?" has-deck":""}"><div class="archive-player-identity"><strong>${escape(primary)}</strong>
      ${primary!==id?`<small>${escape(id)}</small>`:""}
      ${real&&official&&real!==official?`<small>官方名稱：${escape(official)}</small>`:""}
      </div>${deckMarkup}</div>`;
  };
  const score=p=>{
    const r=p?.record;
    if(!r)return selectedRound==="1"?"首輪（無前輪積分）":"—";
    if(r.points!==null&&r.points!==undefined&&Number.isFinite(Number(r.points)))
      return `${escape(r.points)} pt`;
    if([r.wins,r.losses,r.ties].every(v=>Number.isFinite(Number(v))))
      return `${escape(r.wins)}/${escape(r.losses)}/${escape(r.ties)}`;
    return "—";
  };
  const observationHTML=row=>{
    const item=view?.context?.observations?.[`${selectedRound}:${row.table}`];
    if(!item?.deck_a&&!item?.deck_b)return "";
    return `<div class="archive-pair-observation">該桌曾記錄：${escape([item.deck_a,item.deck_b].filter(Boolean).join(" ／ "))}<small>只知道這桌的牌組，尚未確認各牌組分別屬於哪位玩家</small></div>`;
  };
  function renderRows() {
    const root=$("matchArchiveRows");
    if(!root||!view)return;
    const term=$("matchArchiveSearch")?.value.trim()||"";
    if(selectedRound==="final"||selectedRound==="interim") {
      const provisional=selectedRound==="interim";
      const source=provisional?view.interim:view.final;
      if(!source){root.innerHTML=`<p class="archive-empty">${provisional?"尚未封存暫定排名":"尚未封存正式最終排名"}。</p>`;return;}
      const rows=standingRows(source);
      const fromLastRound=source?.source_status==="completed_last_round";
      const title=provisional?`Round ${source.round_no} 暫定排名（非最終成績）`:
        fromLastRound?`第 ${view.event.expected_rounds||"最後"} 輪結束排名（本場最終）`:"官方最終排名";
      const reference=view.final_score_references;
      const roundBefore=reference?.before_round;
      const fallbackCount=!provisional?rows.filter(p=>p.points==null&&
        reference?.points?.[normalizedId(p)]!=null).length:0;
      root.innerHTML=`<p class="archive-subtitle">${escape(title)} · ${rows.length} 位${term?"（篩選結果）":""} · ${escape(source.captured_at||"")}</p>
        ${fallbackCount?`<p class="archive-empty">最終排名的 TtlScore 尚未全部取得；標示 R${escape(roundBefore)} 前的數字是最後一輪開始前的積分，<strong>不是最終分數</strong>。</p>`:""}
        <div class="archive-scroll archive-standings-scroll"><table class="archive-standings-table" style="width:100%;min-width:0;table-layout:fixed"><colgroup><col style="width:11%"><col style="width:32%"><col style="width:39%"><col style="width:18%"></colgroup><thead><tr><th>名次</th><th>選手</th><th>牌組</th><th>TtlScore</th></tr></thead><tbody>
        ${rows.map(p=>`<tr><td>${escape(p.rank)}</td><td>${playerHTML(p,false)}</td><td>${editableDeckHTML(p)}</td>
          <td>${p.points!=null?escape(p.points):!provisional&&reference?.points?.[normalizedId(p)]!=null
            ?`${escape(reference.points[normalizedId(p)])} <small>R${escape(roundBefore)} 前</small>`:"—"}</td></tr>`).join("")}
        </tbody></table></div>
        ${provisional?'<p class="archive-empty">這是官方各輪結束後的暫定排名，尚未確認已打完全部輪次。</p>':
      fromLastRound?'<p class="archive-empty">這場賽事的總輪數已確認完成。來源頁雖標示 interim result，本站依最後輪結果保存本場最終名次。</p>':""}`;
      return;
    }
    if(!view.selected){root.innerHTML='<p class="archive-empty">該輪尚無封存資料。</p>';return;}
    const rows=currentMatchRows();
    root.innerHTML=`<p class="archive-subtitle">Round ${escape(selectedRound)} · ${rows.length} 桌${term?"（篩選結果）":""} · ${escape(view.selected.captured_at||"")}</p>
      <div class="archive-scroll archive-matches-scroll"><table style="width:100%;min-width:0;table-layout:fixed"><colgroup><col style="width:clamp(52px,15vw,70px)"><col><col><col style="width:clamp(58px,16vw,150px)"></colgroup><thead><tr><th style="white-space:nowrap!important;overflow-wrap:normal!important;text-align:center">桌號</th><th>選手 A／歷史牌組</th><th>選手 B／歷史牌組</th><th><span class="archive-score-desktop">對戰前積分（TtlScore）</span><span class="archive-score-mobile">對戰前<br>TtlScore</span></th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td style="white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;padding-inline:2px;text-align:center"><span class="archive-table-number" style="display:inline-block;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important">${escape(r.table)}</span></td><td>${playerHTML(r.a)}</td><td>${playerHTML(r.b)}</td>
        <td><small>A：${score(r.a)}</small><small>B：${score(r.b)}</small>${observationHTML(r)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  async function loadSelected() {
    const tid=activeTid,value=$("matchArchiveRound")?.value||"final";
    if(!tid)return;
    const request=++archiveGeneration;
    selectedRound=value;
    lastRoundByTid.set(tid,value);
    try {
      message("正在讀取已保存的比賽資料…");
      const data=await archiveGet(tid,numericRound(value));
      if(request!==archiveGeneration||tid!==activeTid||!token())return;
      if(!data)throw new Error("找不到這場賽事的封存");
      useArchive(data,tid,value);
    }catch(e){if(request===archiveGeneration)message(String(e.message||e),true);}
  }
  async function choose(tid="",force=false) {
    activeTid=tid||$("matchArchiveEvent")?.value||"";
    const chosen=activeTid,request=++archiveGeneration;
    if(!chosen){
      view=null;
      $("matchArchiveRows").innerHTML='<p class="archive-empty">目前尚無已追蹤並封存的賽事。</p>';
      return;
    }
    const item=archives.find(x=>String(x.tid)===chosen);
    const preferred=lastRoundByTid.get(chosen);
    // Finished events normally display the final ranking. Otherwise fetch the
    // latest available round in the same request (no second archive GET).
    const firstRound=preferred||((item?.final_seen_at)?"final":String(item?.last_round||"final"));
    const requestedRound=numericRound(firstRound);
    try {
      message("正在讀取已保存的比賽資料…");
      const data=await archiveGet(chosen,requestedRound,{force});
      if(request!==archiveGeneration||chosen!==activeTid||!token())return;
      if(!data)throw new Error("目前查不到封存紀錄");
      const expected=$("matchArchiveExpectedRounds"),button=$("matchArchiveSetRounds");
      if(expected) {
        expected.value=data.event.expected_rounds==null?"":String(data.event.expected_rounds);
        expected.disabled=Boolean(data.event.final_seen_at)||data.event.status==="completed";
      }
      if(button)button.disabled=Boolean(expected?.disabled);
      const options=(data.rounds||[]).map(r=>`<option value="${escape(r.round_no)}">Round ${escape(r.round_no)}（${escape(r.table_count)} 桌）</option>`);
      if(data.interim)options.push(`<option value="interim">Round ${escape(data.interim.round_no)} 暫定排名</option>`);
      if(data.final)options.push('<option value="final">最終排名</option>');
      const select=$("matchArchiveRound");
      select.innerHTML=options.join("");
      let wanted=firstRound;
      const validValues=(data.rounds||[]).map(r=>String(r.round_no));
      if(data.interim)validValues.push("interim");
      if(data.final)validValues.push("final");
      if(!validValues.includes(wanted))
        wanted=data.final?"final":data.interim?"interim":String(data.rounds?.at(-1)?.round_no||"");
      select.value=wanted;
      lastRoundByTid.set(chosen,wanted);
      if(!wanted){
        view=data;
        $("matchArchiveRows").innerHTML='<p class="archive-empty">已建立封存，正在等待首輪配對公布。</p>';
        return;
      }
      // A missing/changed preferred round should never display the wrong rows.
      if(numericRound(wanted)!==requestedRound){
        await loadSelected();
        return;
      }
      useArchive(data,chosen,wanted);
    }catch(e){if(request===archiveGeneration)message("讀取封存資料失敗："+String(e.message||e),true);}
  }
  async function refresh(force=false) {
    if(!token())return;
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      try {
        const user=accountId();
        const data=await api("list");
        if(!token()||accountId()!==user)return;
        archives=data.archives||[];
        loadedForUser=user;
        if(force)archiveCache.clear();
        const select=$("matchArchiveEvent");
        const current=activeTid||select.value;
        select.innerHTML=archives.map(a=>`<option value="${escape(a.tid)}">${escape(archiveTitle(a))}</option>`).join("");
        if(current&&archives.some(a=>a.tid===current))select.value=current;
        else activeTid=archives[0]?.tid||"";
        $("matchArchiveLinkDay1").innerHTML='<option value="">Day 1（不設定）</option>'+
          archives.filter(a=>a.tid!==select.value).map(a=>`<option value="${escape(a.tid)}">${escape(a.tid)} · ${escape(a.title||"賽事")}</option>`).join("");
        await choose(select.value||activeTid,force);
      }catch(e){message("讀取封存清單失敗："+String(e.message||e),true);}
    })();
    try{return await refreshPromise;}finally{refreshPromise=null;}
  }
  async function registerFromTracking(ev) {
    const source=ev.detail?.parsed?.url||ev.detail?.watch?.source_url;
    if(!source)return;
    try {
      await api("register-tracked",{url:source});
      message("已啟動整場賽事封存；每 5 分鐘檢查新配對與最終排名。");
      if($("matchArchive"))await refresh();
    }catch(e){message("追蹤通知已啟動，但封存登記失敗："+String(e.message||e),true);}
  }
  async function configureRounds() {
    const input=$("matchArchiveExpectedRounds");
    const number=Number(input?.value);
    if(!activeTid||!Number.isInteger(number)||number<1||number>40) {
      message("請先選擇賽事並輸入現場確認的總輪數（1～40）。",true);return;
    }
    try {
      await api("configure-rounds",{tid:activeTid,expected_rounds:number});
      message("已確認本場總共 "+number+" 輪；官方最後一輪的 End of Round 排名將自動判定為本場最終成績。");
      await refresh(true);
    }catch(e){message(String(e.message||e),true);}
  }
  async function linkDay1() {
    const parent=$("matchArchiveLinkDay1").value;
    if(!activeTid||!parent)return;
    try {await api("link",{tid:activeTid,day1_tid:parent});message("已將目前 TID 設為 Day 2，並與 Day 1 封存關聯。");await refresh();}
    catch(e){message(String(e.message||e),true);}
  }
  function init() {
    document.addEventListener("pairing:tracking-started",registerFromTracking);
    // A private knockout save must invalidate its cached podium immediately.
    document.addEventListener("archive:invalidate",event=>{
      const tid=String(event.detail?.tid||"");
      if(!tid)return;
      const prefix=accountId()+":"+tid+":";
      for(const key of archiveCache.keys())if(key.startsWith(prefix))archiveCache.delete(key);
    });
    if(!$("matchArchive"))return;
    $("matchArchiveEvent")?.addEventListener("change",e=>{closeDeckEditor();activeTid=e.target.value;void choose(activeTid);});
    $("matchArchiveRound")?.addEventListener("change",()=>{closeDeckEditor();void loadSelected();});
    $("matchArchiveSearch")?.addEventListener("input",renderRows);
    $("matchArchiveRows")?.addEventListener("click",event=>{const button=event.target.closest?.("[data-archive-edit-player]");if(button)void openDeckEditor(button.dataset.archiveEditPlayer);});
    $("matchArchiveRefresh")?.addEventListener("click",()=>{void refresh(true);});
    $("matchArchiveLinkButton")?.addEventListener("click",()=>{void linkDay1();});
    $("matchArchiveSetRounds")?.addEventListener("click",()=>{void configureRounds();});
    $("matchArchive")?.addEventListener("toggle",e=>{
      if(e.target.open&&(!archives.length||loadedForUser!==accountId()))void refresh();
    });
    document.addEventListener("pairing:auth-ready",ev=>{
      if(!ev.detail?.allowed){
        closeDeckEditor();++archiveGeneration;archiveCache.clear();lastRoundByTid.clear();
        archives=[];view=null;activeTid="";loadedForUser="";
        return;
      }
      if($("matchArchive")?.open&&(!archives.length||loadedForUser!==accountId()))void refresh();
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
