(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let fixture, allowed = false, running = false, revision = 0;
  let lastRequest = null;
  const percent = x => `${Math.round(x * 100)}%`;
  const range = ([lo, hi]) => lo === hi ? percent(lo) : `${percent(lo)}–${percent(hi)}`;
  const escape = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function dirty() { revision++; lastRequest = null; $('oddsResult').textContent = '設定已變更，請重新估算。'; $('oddsActual').hidden = true; }
  async function load() {
    if (!fixture) {
      const response = await fetch('data/pairing-odds-3000442.json?v=1.10.0');
      if (!response.ok) throw new Error('測試資料讀取失敗，請稍後重試。');
      fixture = await response.json();
    }
    return fixture;
  }
  function syncPreset() {
    const preset = $('oddsType').value;
    $('oddsCut').value = preset === 'premier' ? '256' : preset === 'ultra' ? '8' : '';
    dirty();
  }
  function render(output, snapshot, options) {
    const me = snapshot.players.find(p=>p.id===options.playerId);
    const remaining = options.totalRounds-snapshot.completed;
    const cards = output.cuts.map((cut,i)=>`<article><span>前 ${cut} 名</span><strong>${range(output.scoreBounds[i])}</strong><small>${cut===options.cut?'你的目標門檻':'累計名次機率'}</small></article>`).join('');
    const rows=output.scenarios.map(s=>`<tr><th scope="row">${s.score} 分</th><td>${percent(s.count/output.trials)}</td>${s.low.map((x,i)=>`<td>${range([x/s.count,s.high[i]/s.count])}${s.count<50?' *':''}</td>`).join('')}</tr>`).join('');
    $('oddsResult').innerHTML = `<p class="odds-summary"><strong>${escape(options.playerId)} · 第 ${snapshot.round} 輪開始前 · ${me.score} 分</strong><br>本輪配對 ${snapshot.listed} 人／截至本輪曾列入 ${snapshot.knownParticipants} 人 · 已完成 ${snapshot.completed} 輪，剩 ${remaining} 輪</p>
      <div class="odds-cards">${cards}</div>
      <p class="odds-explanation">區間左端：同分小分最不利仍進入；右端：同分小分最有利可進入。這是小分未定的上下界，並非信賴區間。各門檻互相包含，不能相加。</p>
      ${options.cut>snapshot.listed?'<p class="odds-warning">目標名額超過這場測試人數，因此會涵蓋全部留賽玩家；這不能代表紀念球等大型賽事的機率。</p>':''}
      <details><summary>查看最後積分的條件情境</summary><div class="odds-table-wrap"><table><thead><tr><th>最後積分</th><th>此情境出現比例</th>${output.cuts.map(c=>`<th>前 ${c} 名</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p>每列名次機率以「最後拿到這個積分」為條件。* 此情境少於 50 次，結果較不穩定。</p></details>
      <p class="odds-footnote">${output.trials.toLocaleString()} 次模擬；你的每場勝率假設 ${Math.round(options.chance*100)}%，其他對戰 50%。已公布的本輪配對固定，後續依相近積分配對並盡量避開重複對手。假設未來無新增／退賽、無和局／雙敗；輪空得 3 分。尚未套用完整 OMW%／WOScore／AVOMW% 排序，也不是官方配對演算法。顯示 0%／100% 僅代表本次模擬結果，不是保證。</p>`;
    $('oddsActual').hidden = options.totalRounds !== fixture.actualRounds;
    $('oddsActual').open = false;
    $('oddsActualResult').textContent='按下「讀取官方最終結果」後比對；預估不讀取最終成績。';
  }
  async function run() {
    if (!allowed || running) return;
    running=true; $('oddsRun').disabled=true;
    const token=revision;
    $('oddsResult').textContent='正在模擬整場剩餘對戰…'; $('oddsActual').hidden=true;
    try {
      const data=await load();
      const round=Number($('oddsRound').value), totalRounds=Number($('oddsTotal').value), cut=Number($('oddsCut').value);
      const playerId=$('oddsPlayer').value.trim().toLowerCase();
      if(!/^tw\d{8}$/.test(playerId)) throw new Error('請輸入完整 PTCG ID，例如 tw39371632。');
      if(!Number.isInteger(cut)||cut<1||cut>4096) throw new Error('請填寫要取的名次，範圍為 1–4096。');
      const snapshot=data.snapshots.find(s=>s.round===round);
      if(!snapshot)throw new Error('請選擇測試輪次。');
      const options={playerId,totalRounds,cut,cuts:$('oddsType').value==='ultra'?[8,16,32,cut]:[cut],chance:Number($('oddsChance').value)/100,trials:3000,seed:3000442+round};
      await new Promise(resolve=>setTimeout(resolve,20));
      const output=window.PairingOddsEngine.simulate(snapshot,options);
      if(token!==revision || !allowed)return;
      lastRequest={playerId,totalRounds}; render(output,snapshot,options);
    } catch(error) { if(token===revision && allowed) $('oddsResult').textContent=error.message || '估算失敗，請重新操作。'; }
    finally {running=false;$('oddsRun').disabled=!allowed;}
  }
  async function actual() {
    if(!allowed || !lastRequest)return;
    const request=lastRequest,token=revision;
    $('oddsActualResult').textContent='讀取官方最終成績…';
    try {
      const response=await fetch('data/pairing-odds-3000442-final.json?v=1.10.0');
      if(!response.ok)throw new Error('最終成績讀取失敗，請稍後重試。');
      const data=await response.json(); if(token!==revision || !allowed)return;
      const row=data.standings.find(p=>p.id===request.playerId);
      $('oddsActualResult').textContent=row?`官方實際第 ${row.rank} 名，${row.score} 分。OMW% ${row.omw}／WOScore ${row.wo}／AVOMW% ${row.av}。單場比對可檢查流程，尚不足以證明機率準確。`:'官方最終榜未列出這個 ID，無法以此判定最終名次。';
    } catch(error) {if(token===revision && allowed)$('oddsActualResult').textContent=error.message;}
  }
  document.addEventListener('pairing:auth-ready',event=>{
    allowed=Boolean(event.detail?.allowed);$('oddsRun').disabled=!allowed;
    if(!allowed)dirty();
  });
  document.addEventListener('DOMContentLoaded',()=>{
    // Reuse the existing gate; the fixture itself contains only public player IDs.
    allowed=typeof pairingAuthorized!=='undefined' && pairingAuthorized;
    $('oddsRun').disabled=!allowed;
    $('oddsRun').addEventListener('click',run);
    $('oddsReadActual').addEventListener('click',actual);
    $('oddsType').addEventListener('change',syncPreset);
    ['oddsPlayer','oddsRound','oddsTotal','oddsCut','oddsChance'].forEach(id=>$(id).addEventListener('input',dirty));
    $('oddsUsePlayer').addEventListener('click',()=>{$('oddsPlayer').value=$('pairingPlayerId').value;dirty();});
  });
})();
