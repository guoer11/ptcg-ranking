from pathlib import Path

path = Path('pitching-app/index.html')
text = path.read_text(encoding='utf-8')

def rep(old,new,label):
    global text
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    text = text.replace(old,new,1)

rep(
"    .modeBtn{border:1px solid var(--line);background:rgba(255,255,255,.06);border-radius:12px;padding:10px 11px;font-size:12px;font-weight:700}\n",
"    .modeBtn{border:1px solid var(--line);background:#122238;color:var(--text);border-radius:12px;padding:10px 11px;font-size:12px;font-weight:700;appearance:none;-webkit-appearance:none}\n    .duelHud{position:absolute;left:12px;top:12px;z-index:18;padding:9px 11px;border-radius:14px;background:rgba(4,11,19,.76);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);min-width:150px}\n    .duelHud.hidden{display:none}.duelName{font-size:11px;color:#c6d3e1}.duelCount{display:flex;align-items:center;gap:8px;margin-top:4px}.duelCount b{font-size:16px}.duelCount span{font-size:10px;color:var(--muted);margin-left:auto}\n    .batter.swing{animation:batterSwing .36s ease-out}\n    @keyframes batterSwing{0%{transform:rotate(0) translateX(0)}45%{transform:rotate(-15deg) translateX(-6px)}100%{transform:rotate(0) translateX(0)}}\n",
'css mode + duel hud')

rep(
'    <button class="modeBtn" id="modeBtn">🎯 控球挑戰</button>',
'    <select class="modeBtn" id="modeSelect" aria-label="遊戲模式"><option value="duel">⚔️ 打者對決</option><option value="free">⚾ 自由投球</option><option value="challenge">🎯 控球挑戰</option></select>',
'top mode control')

rep(
'    <div class="toast" id="toast">STRIKE!</div>\n    <div class="resultCard">',
'    <div class="toast" id="toast">STRIKE!</div>\n    <div class="duelHud" id="duelHud"><div class="duelName" id="duelName">AI 打者</div><div class="duelCount"><b id="ballCount">B 0</b><b id="strikeCount">S 0</b><span id="duelRecord">K 0 · BB 0</span></div></div>\n    <div class="resultCard">',
'duel hud markup')

rep(
"let state = JSON.parse(localStorage.getItem('pitchKingState') || '{\"total\":0,\"strikes\":0,\"veloSum\":0,\"best\":0,\"history\":[]}');\nlet selected = pitches[0], target={x:.5,y:.5}, throwing=false, challenge=false, challengeRound=0, challengePoints=0, challengeTarget=4;\nlet aiming=false, aimPointer=null;",
"let state = JSON.parse(localStorage.getItem('pitchKingState') || '{\"total\":0,\"strikes\":0,\"veloSum\":0,\"best\":0,\"history\":[]}');\nstate.duel=Object.assign({ks:0,bb:0,hits:0,pa:0},state.duel||{});\nlet selected = pitches[0], target={x:.5,y:.5}, throwing=false, challenge=false, challengeRound=0, challengePoints=0, challengeTarget=4;\nlet aiming=false, aimPointer=null, gameMode='duel', balls=0, strikesCount=0, paLocked=false, recentPitchIds=[];\nconst batterProfiles=[\n  {name:'選球型打者',zoneSwing:.58,chase:.14,contact:.80,power:.30},\n  {name:'強打者',zoneSwing:.80,chase:.31,contact:.67,power:.76},\n  {name:'巧打型打者',zoneSwing:.72,chase:.22,contact:.88,power:.24},\n  {name:'積極型打者',zoneSwing:.84,chase:.39,contact:.64,power:.48}\n];\nlet currentBatter=batterProfiles[Math.floor(Math.random()*batterProfiles.length)];",
'duel state')

rep(
"  resultMain.textContent=challenge?'拖曳準星對準黃色目標':'拖曳準星瞄準';\n  resultSub.textContent=challenge?'放開後按「挑戰投球」':'可投好球帶內外任意位置';",
"  resultMain.textContent=gameMode==='challenge'?'拖曳準星對準黃色目標':gameMode==='duel'?'配球給打者':'拖曳準星瞄準';\n  resultSub.textContent=gameMode==='challenge'?'放開後按「挑戰投球」':gameMode==='duel'?'瞄準後投球，AI 會判斷是否揮棒':'可投好球帶內外任意位置';",
'drag instruction by mode')

rep(
"function pitch(){\n  if(throwing)return;throwing=true;throwBtn.disabled=true;\n  const actual=actualPitch(), speed=Math.max(90,Math.round(selected.base+randn()*selected.sd));\n  velo.innerHTML=`${speed} <small>km/h</small>`;resultMain.textContent='投球中…';resultSub.textContent=selected.name;\n  animateBall(actual,()=>{\n    const r=classify(actual);\n    state.total++; if(r.inside)state.strikes++;state.veloSum+=speed;state.best=Math.max(state.best,speed);\n    state.history.unshift({t:Date.now(),pitch:selected.name,speed,result:r.label});state.history=state.history.slice(0,40);\n    if(challenge){\n      challengeRound++;\n      const goal=cellCenter(challengeTarget);\n      const goalDist=Math.hypot(actual.x-goal.x,actual.y-goal.y);\n      const hit=goalDist<.19;\n      const pts=hit?Math.max(50,Math.round(100-goalDist*260)):Math.max(0,Math.round(35-goalDist*80));\n      challengePoints+=pts;\n      resultMain.textContent=hit?`命中目標 +${pts}`:`偏掉了 +${pts}`;\n      resultSub.textContent=`第 ${challengeRound}/10 球｜${r.label}`;\n      showToast(hit?'TARGET!':r.label,hit?'good':r.kind);\n      if(challengeRound>=10){\n        setTimeout(()=>finishChallenge(),700);\n      }else{\n        const previous=challengeTarget;do{challengeTarget=Math.floor(Math.random()*9)}while(challengeTarget===previous);\n        updateChallengeMarker();\n      }\n    } else {\n      resultMain.textContent=r.label;\n      resultSub.textContent=`${selected.name}｜落點誤差 ${Math.round(r.dist*100)}%`;\n      showToast(r.label,r.kind);\n    }\n    save();updateStats();throwing=false;throwBtn.disabled=false;\n  })\n}\n",
"function updateDuelHud(){\n  $('#duelHud').classList.toggle('hidden',gameMode!=='duel');\n  $('#duelName').textContent=`${currentBatter.name}｜打席 ${state.duel.pa+1}`;\n  $('#ballCount').textContent=`B ${balls}`;\n  $('#strikeCount').textContent=`S ${strikesCount}`;\n  $('#duelRecord').textContent=`K ${state.duel.ks} · BB ${state.duel.bb} · H ${state.duel.hits}`;\n}\nfunction newBatter(){\n  balls=0;strikesCount=0;recentPitchIds=[];\n  currentBatter=batterProfiles[Math.floor(Math.random()*batterProfiles.length)];\n  updateDuelHud();\n}\nfunction swingBatter(){const b=$('.batter');b.classList.remove('swing');void b.offsetWidth;b.classList.add('swing');setTimeout(()=>b.classList.remove('swing'),420)}\nfunction endPlateAppearance(title,sub,kind='good'){\n  paLocked=true;state.duel.pa++;resultMain.textContent=title;resultSub.textContent=sub;showToast(title,kind);updateDuelHud();save();updateStats();\n  setTimeout(()=>{newBatter();paLocked=false;throwing=false;throwBtn.disabled=false;resultMain.textContent='下一位打者';resultSub.textContent='重新配球，試著製造三振';},900);\n}\nfunction handleDuelPitch(actual,r,speed){\n  const outsideX=actual.x<0?-actual.x:actual.x>1?actual.x-1:0;\n  const outsideY=actual.y<0?-actual.y:actual.y>1?actual.y-1:0;\n  const outsideDist=Math.hypot(outsideX,outsideY);\n  const repeatCount=recentPitchIds.filter(id=>id===selected.id).length;\n  let swingProb=r.inside?currentBatter.zoneSwing:currentBatter.chase*clamp(1-outsideDist/.6,.08,1);\n  if(strikesCount===2)swingProb+=.12;if(balls===3&&!r.inside)swingProb-=.10;if(repeatCount>=2)swingProb+=.10;\n  swingProb=clamp(swingProb,.03,.96);\n  const swings=Math.random()<swingProb;\n  recentPitchIds.push(selected.id);recentPitchIds=recentPitchIds.slice(-4);\n  if(!swings){\n    if(r.inside){strikesCount++;resultMain.textContent='看著好球';resultSub.textContent=`${selected.name}｜${speed} km/h`;showToast('CALLED STRIKE','good')}\n    else{balls++;resultMain.textContent='選掉壞球';resultSub.textContent=`${selected.name}｜${speed} km/h`;showToast('BALL','bad')}\n  }else{\n    swingBatter();\n    const breakDifficulty=clamp((Math.abs(selected.breakX)+Math.abs(selected.breakY))/115,0,.34);\n    const veloDifficulty=clamp((speed-135)/85,0,.20);\n    let contactProb=currentBatter.contact-breakDifficulty-veloDifficulty+(repeatCount*.07);\n    if(!r.inside)contactProb-=.20+outsideDist*.35;\n    contactProb=clamp(contactProb,.12,.94);\n    if(Math.random()>contactProb){strikesCount++;resultMain.textContent='揮棒落空！';resultSub.textContent=`${selected.name} 騙到打者`;showToast('SWING & MISS','good')}\n    else{\n      const poor=(!r.inside)||r.dist>.22||Math.random()>.72;\n      if(poor||Math.random()<.38){if(strikesCount<2)strikesCount++;resultMain.textContent='界外球';resultSub.textContent='打者碰到球，但沒有打好';showToast('FOUL')}\n      else{\n        const hitChance=clamp(.24+currentBatter.power*.18-(r.dist<.12?.08:0),.16,.48);\n        if(Math.random()<hitChance){state.duel.hits++;const extra=Math.random()<currentBatter.power*.22;endPlateAppearance(extra?'長打！':'安打',`${currentBatter.name} 把 ${selected.name} 打進場內`,'bad');return true}\n        endPlateAppearance('打者出局','球被打進場內但形成出局','good');return true\n      }\n    }\n  }\n  updateDuelHud();\n  if(strikesCount>=3){state.duel.ks++;endPlateAppearance('三振！',`${selected.name} 解決 ${currentBatter.name}`,'good');return true}\n  if(balls>=4){state.duel.bb++;endPlateAppearance('四壞保送',`${currentBatter.name} 選到保送`,'bad');return true}\n  return false;\n}\nfunction pitch(){\n  if(throwing||paLocked)return;throwing=true;throwBtn.disabled=true;\n  const actual=actualPitch(), speed=Math.max(70,Math.round(selected.base+randn()*selected.sd));\n  velo.innerHTML=`${speed} <small>km/h</small>`;resultMain.textContent='投球中…';resultSub.textContent=selected.name;\n  animateBall(actual,()=>{\n    const r=classify(actual);\n    state.total++;if(r.inside)state.strikes++;state.veloSum+=speed;state.best=Math.max(state.best,speed);\n    if(gameMode==='duel'){\n      const ended=handleDuelPitch(actual,r,speed);\n      const duelResult=resultMain.textContent;state.history.unshift({t:Date.now(),pitch:selected.name,speed,result:duelResult});state.history=state.history.slice(0,40);\n      save();updateStats();if(ended)return;\n    }else if(gameMode==='challenge'){\n      challengeRound++;const goal=cellCenter(challengeTarget);const goalDist=Math.hypot(actual.x-goal.x,actual.y-goal.y);const hit=goalDist<.19;const pts=hit?Math.max(50,Math.round(100-goalDist*260)):Math.max(0,Math.round(35-goalDist*80));challengePoints+=pts;\n      resultMain.textContent=hit?`命中目標 +${pts}`:`偏掉了 +${pts}`;resultSub.textContent=`第 ${challengeRound}/10 球｜${r.label}`;showToast(hit?'TARGET!':r.label,hit?'good':r.kind);\n      state.history.unshift({t:Date.now(),pitch:selected.name,speed,result:hit?'TARGET':r.label});state.history=state.history.slice(0,40);\n      if(challengeRound>=10)setTimeout(()=>finishChallenge(),700);else{const previous=challengeTarget;do{challengeTarget=Math.floor(Math.random()*9)}while(challengeTarget===previous);updateChallengeMarker()}\n    }else{\n      resultMain.textContent=r.label;resultSub.textContent=`${selected.name}｜落點誤差 ${Math.round(r.dist*100)}%`;showToast(r.label,r.kind);state.history.unshift({t:Date.now(),pitch:selected.name,speed,result:r.label});state.history=state.history.slice(0,40);\n    }\n    save();updateStats();throwing=false;throwBtn.disabled=false;\n  })\n}\n",
'pitch duel engine')

rep(
"function toggleChallenge(){\n  if(throwing)return;\n  challenge=!challenge;challengeRound=0;challengePoints=0;challengeTarget=Math.floor(Math.random()*9);\n  $('#modeLabel').textContent=challenge?'10球控球挑戰':'自由投球';\n  $('#modeBtn').textContent=challenge?'⚾ 自由投球':'🎯 控球挑戰';\n  throwBtn.textContent=challenge?'🎯 挑戰投球':'⚾ 投球';\n  resultMain.textContent=challenge?'拖曳準星對準黃色目標':'拖曳準星瞄準';\n  resultSub.textContent=challenge?'10 球，可滑動微調到任意位置':'可投好球帶內外任意位置';\n  updateChallengeMarker();updateStats();\n}\n",
"function setMode(mode){\n  if(throwing||paLocked)return;gameMode=mode;challenge=mode==='challenge';\n  if(gameMode==='challenge'){challengeRound=0;challengePoints=0;challengeTarget=Math.floor(Math.random()*9);$('#modeLabel').textContent='10球控球挑戰';throwBtn.textContent='🎯 挑戰投球';resultMain.textContent='拖曳準星對準黃色目標';resultSub.textContent='10 球，可滑動微調到任意位置'}\n  else if(gameMode==='duel'){challenge=false;newBatter();$('#modeLabel').textContent='打者對決';throwBtn.textContent='⚾ 投球對決';resultMain.textContent='配球給打者';resultSub.textContent='AI 會依球路與球數決定是否揮棒'}\n  else{challenge=false;$('#modeLabel').textContent='自由投球';throwBtn.textContent='⚾ 投球';resultMain.textContent='拖曳準星瞄準';resultSub.textContent='可投好球帶內外任意位置'}\n  updateChallengeMarker();updateDuelHud();updateStats();\n}\n",
'mode selector')

rep(
"    let h=`<div class=\"statsGrid\"><div class=\"statBox\"><b>${state.total}</b><span>累計投球</span></div><div class=\"statBox\"><b>${pct}%</b><span>好球率</span></div><div class=\"statBox\"><b>${avg||'—'}</b><span>平均球速 km/h</span></div><div class=\"statBox\"><b>${state.best||'—'}</b><span>最快球速 km/h</span></div></div>`;",
"    let h=`<div class=\"statsGrid\"><div class=\"statBox\"><b>${state.total}</b><span>累計投球</span></div><div class=\"statBox\"><b>${pct}%</b><span>好球率</span></div><div class=\"statBox\"><b>${avg||'—'}</b><span>平均球速 km/h</span></div><div class=\"statBox\"><b>${state.best||'—'}</b><span>最快球速 km/h</span></div><div class=\"statBox\"><b>${state.duel.ks}</b><span>對決三振</span></div><div class=\"statBox\"><b>${state.duel.bb}</b><span>四壞保送</span></div><div class=\"statBox\"><b>${state.duel.hits}</b><span>被敲安打</span></div><div class=\"statBox\"><b>${state.duel.pa}</b><span>完成打席</span></div></div>`;",
'stats duel')

rep(
"    $('#sheetBody').innerHTML=`<div class=\"help\"><p><b>自由投球：</b>先選球種，直接在球場上按住並拖曳藍色準星，可瞄準好球帶內或外側任意位置，放開後按「投球」。目前收錄 45 種球路，包含速球、滑球、曲球、變速、下墜與特殊／歷史球種；不同球種的球速、控球與位移都不一樣。</p><p><b>控球挑戰：</b>每回合會出現黃色目標，共 10 球。實際落點越接近指定目標，分數越高。</p><p><b>小技巧：</b>四縫線最好控制；曲球與指叉球位移大，但更容易失投。</p><p>所有紀錄只存在這支手機的瀏覽器裡，不會上傳。</p></div>`;",
"    $('#sheetBody').innerHTML=`<div class=\"help\"><p><b>打者對決：</b>AI 打者會依球的位置、球速、變化量與目前 B/S 球數決定是否揮棒。三振、四壞、安打與出局都會記錄；如果一直重複同一球種，打者會更容易抓到。</p><p><b>自由投球：</b>選球種後拖曳藍色準星，可瞄準好球帶內外任意位置。</p><p><b>控球挑戰：</b>共 10 球，實際落點越接近黃色目標分數越高。</p><p><b>配球提示：</b>兩好球時可用變化球引誘；三壞球時要小心保送；速球與變化球交錯會比一直投同一球更有效。</p><p>目前收錄 45 種球路，紀錄只存在這支手機，不會上傳。</p></div>`;",
'help duel')

rep(
"$('#modeBtn').onclick=toggleChallenge;throwBtn.onclick=pitch;",
"$('#modeSelect').onchange=e=>setMode(e.target.value);throwBtn.onclick=pitch;",
'mode binding')

rep(
"$('#resetBtn').onclick=()=>{if(confirm('要清除全部投球紀錄嗎？')){state={total:0,strikes:0,veloSum:0,best:0,history:[]};save();updateStats();resultMain.textContent='紀錄已重設';resultSub.textContent='可以重新開始投球'}};",
"$('#resetBtn').onclick=()=>{if(confirm('要清除全部投球紀錄嗎？')){state={total:0,strikes:0,veloSum:0,best:0,history:[],duel:{ks:0,bb:0,hits:0,pa:0}};balls=0;strikesCount=0;save();updateStats();updateDuelHud();resultMain.textContent='紀錄已重設';resultSub.textContent='可以重新開始投球'}};",
'reset duel')

rep(
"if($('#pitchCategory')) $('#pitchCategory').onchange=renderPitches;renderZone();renderPitches();updateStats();",
"if($('#pitchCategory')) $('#pitchCategory').onchange=renderPitches;renderZone();renderPitches();setMode('duel');updateStats();",
'init duel')

path.write_text(text,encoding='utf-8')

sw=Path('pitching-app/sw.js')
s=sw.read_text(encoding='utf-8')
s=s.replace("const CACHE='pitch-king-v3';","const CACHE='pitch-king-v4';",1)
sw.write_text(s,encoding='utf-8')
Path('pitching-app/version.txt').write_text('Pitch King v3 - batter duel AI\n',encoding='utf-8')
print('Pitch King v3 duel patch applied')
