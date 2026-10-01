(() => {
  'use strict';
  const $=id=>document.getElementById(id),endpoint='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-forecast';
  let allowed=false,running=false,revision=0,fixture=null,worker=null,workerReject=null,lastResult=null,context=null,controller=null;
  const decisions=new Map();
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=x=>`${Math.round(x*100)}%`,range=([a,b])=>a===b?pct(a):`${pct(a)}–${pct(b)}`;
  const record=(score,total)=>score%3===0&&score/3<=total?`${score/3} 勝 ${total-score/3} 敗`:`${score} 分`;
  const live=()=>$('oddsMode').value==='live';
  const player=()=>String(live()?$('pairingPlayerId').value:$('oddsPlayer').value).trim().toLowerCase();
  function cancel(){controller?.abort();controller=null;worker?.terminate();worker=null;if(workerReject){workerReject(new Error('已取消'));workerReject=null;}}
  function dirty(){revision++;cancel();lastResult=null;context=null;$('oddsResult').textContent='設定已變更，請重新讀取並估算。';$('oddsPending').hidden=true;$('oddsActual').hidden=true;}
  function options(){
    const totalRounds=Number($('oddsTotal').value),cut=Number($('oddsCut').value),playerId=player();
    if(!/^tw\d{6,12}$/.test(playerId))throw new Error('請確認追蹤玩家的 PTCG ID。');
    if(!Number.isInteger(totalRounds)||totalRounds<1||totalRounds>20)throw new Error('總輪數請依現場公告填寫，範圍為 1–20。');
    if(!Number.isInteger(cut)||cut<1||cut>4096)throw new Error('請填寫取幾名，範圍為 1–4096。');
    return {playerId,totalRounds,cut,cuts:$('oddsType').value==='ultra'?[8,16,32,cut]:[cut],chance:Number($('oddsChance').value)/100};
  }
  function decisionKey(tid,round,id){return `${pairingSession?.user?.id||''}:${tid}:${round}:${id}`;}
  function pendingRows(snapshot){return snapshot.pending||snapshot.pairs.filter(p=>p[1]===null).map(p=>({index:p[0],id:snapshot.players[p[0]].id,kind:'unknown',table:''}));}
  function showPending(data){
    const pending=pendingRows(data.snapshot).filter(p=>p.kind!=='bye');
    const box=$('oddsPending');box.hidden=!pending.length;
    if(!pending.length)return;
    box.innerHTML='<strong>這些玩家的對手空白，請依現場確認</strong><p>空白可能是輪空，也可能是缺席。選好每筆的處理方式後，再按「更新配對並估算」。</p><div class="odds-table-wrap"><table><thead><tr><th>玩家 ID</th><th>桌號</th><th>處理方式</th></tr></thead><tbody>'+pending.map(p=>{
      const key=decisionKey(data.tid,data.snapshot.round,p.id),value=decisions.get(key)||'';
      return `<tr><td>${esc(p.id)}</td><td>${esc(p.table||'—')}</td><td><select data-odds-pending="${esc(p.id)}" aria-label="${esc(p.id)} 的空白對手處理"><option value=""${!value?' selected':''}>待確認</option><option value="bye"${value==='bye'?' selected':''}>輪空，得 3 分</option><option value="absent"${value==='absent'?' selected':''}>缺席／退賽，不再留賽</option></select></td></tr>`;
    }).join('')+'</tbody></table></div>';
    box.querySelectorAll('[data-odds-pending]').forEach(select=>select.addEventListener('change',()=>{
      decisions.set(decisionKey(data.tid,data.snapshot.round,select.dataset.oddsPending),select.value);
      revision++;cancel();lastResult=null;$('oddsResult').textContent='空白對手的處理已更新，請重新估算。';$('oddsActual').hidden=true;
    }));
  }
  async function request(body){
    if(!allowed || !pairingSession?.access_token)throw new Error('請先登入授權帳號。');
    const requestController=new AbortController();controller=requestController;const timer=setTimeout(()=>requestController.abort(),90000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${pairingSession.access_token}`,apikey:PAIRING_SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:requestController.signal});
      const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'正式場資料讀取失敗，請重試。');return data;
    }finally{clearTimeout(timer);if(controller===requestController)controller=null;}
  }
  async function load(o){
    if(live()){
      const selection=$('oddsRound').value,round=selection==='top'?Number($('pairingRound').value):selection==='auto'?'auto':Number(selection);
      return request({url:$('pairingSourceUrl').value,player_id:o.playerId,round,total_rounds:o.totalRounds,...(round===9999999?{action:'final'}:{})});
    }
    if(!fixture){const response=await fetch('data/pairing-odds-3000442.json?v=1.11.0');if(!response.ok)throw new Error('歷史場資料讀取失敗。');fixture=await response.json();}
    const round=Number($('oddsHistoryRound').value),snapshot=fixture.snapshots.find(s=>s.round===round);if(!snapshot)throw new Error('請選擇歷史輪次。');
    return {ok:true,type:'snapshot',tid:fixture.tid,title:fixture.title,snapshot,source_url:`https://tcg.sfc-jpn.jp/tourround.asp?tid=${fixture.tid}&kno=${round}&znt=0`,checked_at:fixture.capturedAt};
  }
  function simulate(snapshot,o){
    if(typeof Worker==='undefined')return Promise.resolve(window.PairingOddsEngine.simulate(snapshot,o));
    return new Promise((resolve,reject)=>{
      workerReject=reject;worker=new Worker('pairing-odds-worker.js?v=1.11.0-r1');
      worker.onmessage=event=>{worker?.terminate();worker=null;workerReject=null;event.data.ok?resolve(event.data.output):reject(new Error(event.data.error));};
      worker.onerror=()=>{worker?.terminate();worker=null;workerReject=null;reject(new Error('估算程式讀取失敗，請重新整理頁面。'));};
      worker.postMessage({snapshot,options:o});
    });
  }
  function renderFinal(data,o){
    const p=data.standing;
    $('oddsPending').hidden=true;$('oddsActual').hidden=true;
    $('oddsResult').innerHTML=`<div class="odds-result-heading"><h3>官方最終結果</h3><span class="odds-badge">已公布</span></div><p>${esc(data.title||'此活動')} · ${esc(o.playerId)}</p>${p?`<p class="odds-current">第 <strong>${p.rank}</strong> 名 · ${p.score} 分</p><div class="odds-table-wrap"><table class="odds-record-table"><thead><tr><th>名次門檻</th><th>實際結果</th></tr></thead><tbody>${[...new Set(o.cuts)].sort((a,b)=>a-b).map(c=>`<tr><td>前 ${c} 名</td><td>${p.rank<=c?'已進入':'未進入'}</td></tr>`).join('')}</tbody></table></div>`:'<p>最終榜未列出這個玩家 ID，請至官方頁面確認。</p>'}<p><a href="${esc(data.source_url)}" target="_blank" rel="noopener">查看官方最終排名 ↗</a></p>`;
  }
  function renderTable(output,data,o,view=o.cut){
    const snapshot=data.snapshot,me=snapshot.players.find(p=>p.id===o.playerId),i=output.cuts.indexOf(view),remaining=o.totalRounds-snapshot.completed;
    const population=new Map(output.field.map(p=>[p.score,p])),scenarios=new Map(output.scenarios.map(p=>[p.score,p]));
    const points=new Set(output.field.map(p=>p.score));for(let wins=0;wins<=o.totalRounds;wins++)points.add(wins*3);
    const rows=[...points].sort((a,b)=>b-a).map(score=>{
      const f=population.get(score),s=scenarios.get(score),possible=score>=me.score&&score<=me.score+remaining*3&&(score-me.score)%3===0;
      const count=f?.meanPlayers||0,countText=count>0&&count<.1?'＜0.1':count.toFixed(1);
      const probability=!possible?'目前無法達成':!s||s.count<20?'樣本不足':pct(s.probabilities[i]/s.count);
      return `<tr class="${possible?'is-possible':'is-unreachable'}"><th scope="row">${record(score,o.totalRounds)}<small>${score} 分</small></th><td>約 ${countText}</td><td><strong>${probability}</strong>${s&&s.count>=20?``:''}</td></tr>`;
    }).join('');
    const stable=output.scenarios.filter(s=>s.count>=20&&s.low[i]===s.count).sort((a,b)=>a.score-b.score)[0];
    const roundedProbability=pct(output.probabilities[i]);
    const boundsRows=output.scenarios.filter(s=>s.count>=20).map(s=>`<tr><td>${record(s.score,o.totalRounds)}</td><td>${range([s.low[i]/s.count,s.high[i]/s.count])}</td></tr>`).join('');
    $('oddsResult').innerHTML=`<div class="odds-result-heading"><h3>估算結果</h3><span class="odds-badge">前 ${view} 名</span></div>
      <p class="odds-current"><strong>${esc(o.playerId)}</strong> · 目前 ${record(me.score,snapshot.completed)}（${me.score} 分）<br>第 ${snapshot.round} 輪開始前 · 已完成 ${snapshot.completed} 輪／共 ${o.totalRounds} 輪</p>
      <p class="odds-context">${esc(data.title)}<br>本輪列入 ${snapshot.listed} 人 · 本次估算留賽 ${output.modeledPlayers} 人 · ${esc(new Date(data.checked_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))} 讀取</p>
      <div class="odds-cut-tabs" role="group" aria-label="切換查看名次門檻">${output.cuts.map(c=>`<button type="button" data-odds-view="${c}" aria-pressed="${c===view}" class="${c===view?'active':''}">前 ${c} 名</button>`).join('')}</div>
      <p class="odds-target">進入前 ${view} 名的整體估計：<strong>${roundedProbability}</strong><small>綜合你最後可能拿到的各種戰績</small></p>
      <p class="odds-record-goal">${stable?`本次模擬較穩定的戰績參考：<strong>${record(stable.score,o.totalRounds)}</strong>`:'目前沒有足夠樣本顯示穩定達標的戰績；請查看下方各種結果。'}</p>
      <div class="odds-table-wrap"><table class="odds-record-table"><thead><tr><th>最後戰績</th><th>預估玩家人數</th><th>進入前 ${view} 名的機率</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="odds-explanation">人數是全場各戰績的模擬平均；機率以你拿到該戰績為條件。同分先按剩餘名額平均估計，實際 OMW%／WOScore／AVOMW% 可能改變名次。灰色戰績是你目前已無法達成的結果。</p>
      <details class="odds-method"><summary>查看估算方式與小分範圍</summary><div class="odds-table-wrap"><table><thead><tr><th>戰績</th><th>前 ${view} 名的小分範圍</th></tr></thead><tbody>${boundsRows}</tbody></table></div><p>${output.trials.toLocaleString()} 次模擬；你的每場勝率假設 ${Math.round(o.chance*100)}%，其他對戰 50%。本輪使用已公布配對，後續依相近積分隨機配對。假設未來沒有新增／退賽、和局／雙敗；輪空計 3 分。尚未完整還原官方配對及小分排序。戰績以每勝 3 分推算，遲到或缺席者以現場紀錄為準。</p><p>小分範圍左端為同分最不利、右端為最有利的情況。100% 及「較穩定」僅代表本次模擬與設定，不是保證晉級。</p></details>
      ${o.cut>output.modeledPlayers?'<p class="odds-warning">取的名額多於本次留賽人數，因此涵蓋所有留賽玩家。請確認現場公告與比賽規模。</p>':''}
      <p><a href="${esc(data.source_url)}" target="_blank" rel="noopener">查看這一輪官方配對 ↗</a></p>`;
    $('oddsResult').querySelectorAll('[data-odds-view]').forEach(button=>button.addEventListener('click',()=>renderTable(output,data,o,Number(button.dataset.oddsView))));
    $('oddsActual').hidden=!live()&&o.totalRounds!==7;
    $('oddsActual').open=false;
    $('oddsActualResult').textContent='按下「讀取官方最終結果」後查看；預估只使用選定輪次的資料。';
  }
  function modeUI(){
    $('oddsLiveRoundField').hidden=!live();$('oddsHistoryFields').hidden=live();
    $('oddsRun').textContent=live()?'更新配對並估算':'用歷史場估算';dirty();$('oddsResult').textContent=live()?'沿用上方活動網址與追蹤玩家；確認總輪數及晉級名額後，按更新估算。':'選擇歷史輪次後估算；空白對手會請你確認處理方式。';
  }
  function saveSettings(tid,o){try{sessionStorage.setItem(`ptcg-odds:${pairingSession.user.id}:${tid}`,JSON.stringify({total:o.totalRounds,cut:o.cut,type:$('oddsType').value,chance:$('oddsChance').value}));}catch{}}
  function restoreSettings(){
    if(!allowed||!pairingSession?.user?.id)return;
    try{const url=new URL($('pairingSourceUrl').value),tid=url.hostname==='tcg.sfc-jpn.jp'?url.searchParams.get('tid'):null;if(!tid)return;
      const s=JSON.parse(sessionStorage.getItem(`ptcg-odds:${pairingSession.user.id}:${tid}`)||'null');
      if(!s)return;if(Number.isInteger(s.total)&&s.total>=1&&s.total<=20)$('oddsTotal').value=s.total;if(Number.isInteger(s.cut)&&s.cut>=1&&s.cut<=4096)$('oddsCut').value=s.cut;if(['ultra','premier','master'].includes(s.type))$('oddsType').value=s.type;if(['40','50','60'].includes(s.chance))$('oddsChance').value=s.chance;
    }catch{}
  }
  async function run(){
    if(!allowed||running)return;running=true;$('oddsRun').disabled=true;const token=revision;
    $('oddsResult').textContent=live()?'正在讀取官方完整配對（包含所有分頁）…':'正在讀取歷史場資料…';$('oddsActual').hidden=true;
    try{
      const o=options(),data=await load(o);if(token!==revision||!allowed)return;context={data,o};
      if(data.type==='final'){if(!data.available){$('oddsResult').textContent='官方最終排名尚未公布。';return;}renderFinal(data,o);return;}
      if(live()){
        const selected=$('oddsRound').value;$('oddsRound').innerHTML='<option value="auto">最新已公布輪次（完成後顯示官方名次）</option><option value="top">使用上方查詢 Round</option>'+(data.rounds||[]).map(r=>`<option value="${r}">第 ${r} 輪開始前</option>`).join('');$('oddsRound').value=selected;
      }
      showPending(data);
      o.pendingDecisions=Object.fromEntries(pendingRows(data.snapshot).map(p=>[p.id,decisions.get(decisionKey(data.tid,data.snapshot.round,p.id))||'']));
      o.trials=Math.max(200,Math.min(3000,Math.floor(2500000/(data.snapshot.players.length*(o.totalRounds-data.snapshot.completed)))));o.seed=Number(data.tid)+data.snapshot.round;
      $('oddsResult').textContent='正在模擬剩餘對戰並整理戰績表…';
      const output=await simulate(data.snapshot,o);if(token!==revision||!allowed)return;
      lastResult={output,data,o};renderTable(output,data,o);if(live())saveSettings(data.tid,o);
    }catch(error){if(token===revision&&allowed)$('oddsResult').textContent=error.name==='AbortError'?'資料讀取逾時，請按更新重試。':error.message||'估算失敗，請重試。';}
    finally{running=false;$('oddsRun').disabled=!allowed;}
  }
  async function actual(){
    if(!allowed||!context)return;const token=revision,{data,o}=context;$('oddsActualResult').textContent='正在讀取官方最終成績…';
    try{
      let result;
      if(live())result=await request({action:'final',url:$('pairingSourceUrl').value,player_id:o.playerId});
      else{const response=await fetch('data/pairing-odds-3000442-final.json?v=1.11.0');if(!response.ok)throw new Error('最終成績讀取失敗。');const payload=await response.json();result={available:true,standing:payload.standings.find(p=>p.id===o.playerId)};}
      if(token!==revision||!allowed)return;
      $('oddsActualResult').textContent=!result.available?'官方最終排名尚未公布。':result.standing?`官方實際第 ${result.standing.rank} 名，${result.standing.score} 分。`: '官方最終榜未列出這個玩家 ID。';
    }catch(error){if(token===revision&&allowed)$('oddsActualResult').textContent=error.message;}
  }
  document.addEventListener('pairing:auth-ready',event=>{allowed=Boolean(event.detail?.allowed);$('oddsRun').disabled=!allowed;if(!allowed){dirty();decisions.clear();}else restoreSettings();});
  document.addEventListener('DOMContentLoaded',()=>{
    allowed=typeof pairingAuthorized!=='undefined'&&pairingAuthorized;$('oddsRun').disabled=!allowed;
    $('oddsRun').addEventListener('click',run);$('oddsReadActual').addEventListener('click',actual);$('oddsMode').addEventListener('change',modeUI);
    $('oddsType').addEventListener('change',()=>{$('oddsCut').value=$('oddsType').value==='premier'?'256':$('oddsType').value==='ultra'?'8':'';dirty();});
    ['oddsRound','oddsHistoryRound','oddsPlayer','oddsTotal','oddsCut','oddsChance','pairingSourceUrl','pairingPlayerId','pairingRound'].forEach(id=>$(id).addEventListener('input',dirty));
    $('pairingSourceUrl').addEventListener('change',restoreSettings);restoreSettings();modeUI();
  });
})();
