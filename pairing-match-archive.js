(() => {
  "use strict";
  if(window.__ptcgMatchArchiveUi) return;
  window.__ptcgMatchArchiveUi=true;
  const URL_API="https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-archive";
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let archives=[],view=null,activeTid="",selectedRound="final";
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
    if(deck.current?.deck)return `<span class="archive-deck archive-deck-current"><b>本場已記錄牌組</b>${escape(deck.current.deck)}${deck.current.round?`<small>記錄於 Round ${escape(deck.current.round)}；不代表每輪都使用相同牌組</small>`:""}</span>`;
    if(deck.previous?.deck)return `<span class="archive-deck archive-deck-history"><b>其他場歷史參考</b>${escape(deck.previous.deck)}
      <small>${escape(shortDate(deck.previous.date))} · TID ${escape(deck.previous.tid)}（非本場確認）</small></span>`;
    return "";
  };
  const playerHTML=p=>{
    if(!p)return "<span>輪空／未公布</span>";
    const id=normalizedId(p),real=realName(p),official=String(p.name||"");
    const primary=real||official||id;
    return `<strong>${escape(primary)}</strong>
      ${primary!==id?`<small>${escape(id)}</small>`:""}
      ${real&&official&&real!==official?`<small>官方名稱：${escape(official)}</small>`:""}
      ${deckHTML(p)}`;
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
      root.innerHTML=`<p class="archive-subtitle">${escape(title)} · ${rows.length} 位${term?"（篩選結果）":""} · ${escape(source.captured_at||"")}</p>
        <div class="archive-scroll"><table><thead><tr><th>名次</th><th>選手／歷史牌組</th><th>TtlScore</th></tr></thead><tbody>
        ${rows.map(p=>`<tr><td>${escape(p.rank)}</td><td>${playerHTML(p)}</td><td>${p.points==null?"—":escape(p.points)}</td></tr>`).join("")}
        </tbody></table></div>
        ${provisional?'<p class="archive-empty">這是官方各輪結束後的暫定排名，尚未確認已打完全部輪次。</p>':
      fromLastRound?'<p class="archive-empty">這場賽事的總輪數已確認完成。來源頁雖標示 interim result，本站依最後輪結果保存本場最終名次。</p>':""}`;
      return;
    }
    if(!view.selected){root.innerHTML='<p class="archive-empty">該輪尚無封存資料。</p>';return;}
    const rows=currentMatchRows();
    root.innerHTML=`<p class="archive-subtitle">Round ${escape(selectedRound)} · ${rows.length} 桌${term?"（篩選結果）":""} · ${escape(view.selected.captured_at||"")}</p>
      <div class="archive-scroll"><table><thead><tr><th>桌號</th><th>選手 A／歷史牌組</th><th>選手 B／歷史牌組</th><th>對戰前積分（TtlScore）</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${escape(r.table)}</td><td>${playerHTML(r.a)}</td><td>${playerHTML(r.b)}</td>
        <td><small>A：${score(r.a)}</small><small>B：${score(r.b)}</small>${observationHTML(r)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  async function loadSelected() {
    const value=$("matchArchiveRound")?.value||"final";
    selectedRound=value;
    try {
      message("正在讀取已保存的比賽資料…");
      const result=await api("get",{tid:activeTid,round:value==="final"||value==="interim"?null:Number(value)});
      view=result.archive;
      if(!view)throw new Error("找不到這場賽事的封存");
      renderRows();
      message(view.event.last_error?"部分備份曾讀取失敗；已取得的資料仍保留。":"顯示本站封存資料（不需官方網站仍開放）。");
    }catch(e){message(String(e.message||e),true);}
  }
  async function choose(tid="") {
    activeTid=tid||$("matchArchiveEvent")?.value||"";
    if(!activeTid){$("matchArchiveRows").innerHTML='<p class="archive-empty">目前尚無已追蹤並封存的賽事。</p>';return;}
    const result=await api("get",{tid:activeTid});
    view=result.archive;
    if(!view){message("目前查不到封存紀錄",true);return;}
    const expected=$("matchArchiveExpectedRounds"),button=$("matchArchiveSetRounds");
    if(expected) {
      expected.value=view.event.expected_rounds==null?"":String(view.event.expected_rounds);
      expected.disabled=Boolean(view.event.final_seen_at)||view.event.status==="completed";
    }
    if(button)button.disabled=Boolean(expected?.disabled);
    const options=(view.rounds||[]).map(r=>`<option value="${escape(r.round_no)}">Round ${escape(r.round_no)}（${escape(r.table_count)} 桌）</option>`);
    if(view.interim)options.push(`<option value="interim">Round ${escape(view.interim.round_no)} 暫定排名</option>`);
    if(view.final)options.push('<option value="final">最終排名</option>');
    const select=$("matchArchiveRound");
    select.innerHTML=options.join("");
    selectedRound=view.final?"final":view.interim?"interim":String(view.rounds?.at(-1)?.round_no||"");
    select.value=selectedRound;
    if(!selectedRound){$("matchArchiveRows").innerHTML='<p class="archive-empty">已建立封存，正在等待首輪配對公布。</p>';return;}
    await loadSelected();
  }
  async function refresh() {
    if(!token())return;
    try {
      const data=await api("list");archives=data.archives||[];
      const select=$("matchArchiveEvent");
      const current=activeTid||select.value;
      select.innerHTML=archives.map(a=>`<option value="${escape(a.tid)}">${escape(archiveTitle(a))}</option>`).join("");
      if(current&&archives.some(a=>a.tid===current))select.value=current;
      else activeTid=archives[0]?.tid||"";
      $("matchArchiveLinkDay1").innerHTML='<option value="">Day 1（不設定）</option>'+
        archives.filter(a=>a.tid!==select.value).map(a=>`<option value="${escape(a.tid)}">${escape(a.tid)} · ${escape(a.title||"賽事")}</option>`).join("");
      await choose(select.value||activeTid);
    }catch(e){message("讀取封存清單失敗："+String(e.message||e),true);}
  }
  async function registerFromTracking(ev) {
    const source=ev.detail?.parsed?.url||ev.detail?.watch?.source_url;
    if(!source)return;
    try {
      await api("register",{url:source});
      message("已啟動整場賽事封存；每 5 分鐘檢查新配對與最終排名。");
      await refresh();
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
      await refresh();
    }catch(e){message(String(e.message||e),true);}
  }
  async function linkDay1() {
    const parent=$("matchArchiveLinkDay1").value;
    if(!activeTid||!parent)return;
    try {await api("link",{tid:activeTid,day1_tid:parent});message("已將目前 TID 設為 Day 2，並與 Day 1 封存關聯。");await refresh();}
    catch(e){message(String(e.message||e),true);}
  }
  function init() {
    if(!$("matchArchive"))return;
    $("matchArchiveEvent")?.addEventListener("change",e=>{activeTid=e.target.value;void choose(activeTid);});
    $("matchArchiveRound")?.addEventListener("change",()=>{void loadSelected();});
    $("matchArchiveSearch")?.addEventListener("input",renderRows);
    $("matchArchiveRefresh")?.addEventListener("click",()=>{void refresh();});
    $("matchArchiveLinkButton")?.addEventListener("click",()=>{void linkDay1();});
    $("matchArchiveSetRounds")?.addEventListener("click",()=>{void configureRounds();});
    $("matchArchive")?.addEventListener("toggle",e=>{if(e.target.open)void refresh();});
    document.addEventListener("pairing:auth-ready",ev=>{if(ev.detail?.allowed&&$("matchArchive")?.open)void refresh();});
    document.addEventListener("pairing:tracking-started",registerFromTracking);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
