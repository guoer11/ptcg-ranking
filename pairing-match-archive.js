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
    (a.parent_tid?" (Day 2)":"")+" · "+(a.final_seen_at?"最終排名已封存":a.last_round?"Round "+a.last_round:"等待官方資料");
  function currentMatchRows() {
    if(!view?.selected?.matches)return [];
    const term=$("matchArchiveSearch")?.value.trim().toLowerCase()||"";
    return view.selected.matches.filter(row=>[row.table,row.a?.name,row.a?.id,row.b?.name,row.b?.id]
      .some(t=>String(t||"").toLowerCase().includes(term)));
  }
  function standingRows() {
    const term=$("matchArchiveSearch")?.value.trim().toLowerCase()||"";
    return (view?.final?.standings||[]).filter(row=>[row.rank,row.name,row.id]
      .some(t=>String(t||"").toLowerCase().includes(term)));
  }
  const playerHTML=p=>!p?"<span>輪空／未公布</span>":
    `<strong>${escape(p.name||p.id)}</strong>${p.name?`<small>${escape(p.id)}</small>`:""}`;
  const score=p=>{
    const r=p?.record;
    return r?`${escape(r.wins)}/${escape(r.losses)}/${escape(r.ties)} · ${escape(r.points)}pt`:"—";
  };
  function renderRows() {
    const root=$("matchArchiveRows");
    if(!root||!view)return;
    const term=$("matchArchiveSearch")?.value.trim()||"";
    if(selectedRound==="final") {
      const rows=standingRows();
      if(!view.final){root.innerHTML='<p class="archive-empty">尚未成功封存最終排名。</p>';return;}
      root.innerHTML=`<p class="archive-subtitle">最終排名 · ${rows.length} 位${term?"（篩選結果）":""} · ${escape(view.final.captured_at||"")}</p>
        <div class="archive-scroll"><table><thead><tr><th>名次</th><th>選手</th><th>積分</th></tr></thead><tbody>
        ${rows.map(p=>`<tr><td>${escape(p.rank)}</td><td>${playerHTML(p)}</td><td>${p.points==null?"—":escape(p.points)}</td></tr>`).join("")}
        </tbody></table></div>`;
      return;
    }
    if(!view.selected){root.innerHTML='<p class="archive-empty">該輪尚無封存資料。</p>';return;}
    const rows=currentMatchRows();
    root.innerHTML=`<p class="archive-subtitle">Round ${escape(selectedRound)} · ${rows.length} 桌${term?"（篩選結果）":""} · ${escape(view.selected.captured_at||"")}</p>
      <div class="archive-scroll"><table><thead><tr><th>桌號</th><th>選手 A</th><th>選手 B</th><th>對戰前戰績</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${escape(r.table)}</td><td>${playerHTML(r.a)}</td><td>${playerHTML(r.b)}</td><td><small>${score(r.a)}</small><small>${score(r.b)}</small></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  async function loadSelected() {
    const value=$("matchArchiveRound")?.value||"final";
    selectedRound=value;
    try {
      message("正在讀取已保存的比賽資料…");
      const result=await api("get",{tid:activeTid,round:value==="final"?null:Number(value)});
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
    const options=(view.rounds||[]).map(r=>`<option value="${escape(r.round_no)}">Round ${escape(r.round_no)}（${escape(r.table_count)} 桌）</option>`);
    if(view.final)options.push('<option value="final">最終排名</option>');
    const select=$("matchArchiveRound");
    select.innerHTML=options.join("");
    selectedRound=view.final?"final":String(view.rounds?.at(-1)?.round_no||"");
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
    $("matchArchive")?.addEventListener("toggle",e=>{if(e.target.open)void refresh();});
    document.addEventListener("pairing:auth-ready",ev=>{if(ev.detail?.allowed&&$("matchArchive")?.open)void refresh();});
    document.addEventListener("pairing:tracking-started",registerFromTracking);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
