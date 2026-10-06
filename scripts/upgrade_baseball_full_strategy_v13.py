from pathlib import Path

p=Path('baseball-game.html')
s=p.read_text()

def rep(old,new,count=1):
    global s
    if old not in s:
        raise SystemExit('missing target: '+old[:120])
    s=s.replace(old,new,count)

def replace_between(start_marker,end_marker,new_text):
    global s
    a=s.find(start_marker)
    if a<0: raise SystemExit('missing start '+start_marker)
    b=s.find(end_marker,a)
    if b<0: raise SystemExit('missing end '+end_marker)
    s=s[:a]+new_text.rstrip()+'\n'+s[b:]

# ===== CSS =====
css=r'''
/* ===== V13 complete baseball strategy systems ===== */
.plateFigure{position:absolute;pointer-events:none;transform:translateX(-50%);z-index:12;transform-origin:50% 100%}.plateFigure .ph{position:absolute;left:50%;transform:translateX(-50%);border-radius:50%;background:#b77a58}.plateFigure .pb{position:absolute;left:50%;transform:translateX(-50%);border-radius:7px}.catcher{left:50%;bottom:4.8%;width:58px;height:92px;opacity:.88}.catcher .ph{top:9px;width:18px;height:18px;box-shadow:0 -4px 0 3px #1e2830}.catcher .pb{top:29px;width:38px;height:42px;background:#243845;border:3px solid #202a31}.catcher:before,.catcher:after{content:"";position:absolute;bottom:5px;width:28px;height:10px;border-radius:8px;background:#e7e8e2}.catcher:before{left:2px;transform:rotate(24deg)}.catcher:after{right:2px;transform:rotate(-24deg)}.catcher.receive{animation:catcherReceive .28s ease-out}.umpire{left:50%;bottom:4%;width:70px;height:108px;opacity:.58;z-index:11}.umpire .ph{top:3px;width:21px;height:21px;background:#332d29;box-shadow:0 0 0 3px #111}.umpire .pb{top:25px;width:45px;height:61px;background:#161c22}.umpire.callStrike{animation:umpireStrike .42s ease-out}.umpire.callStrike:after{content:"好球";position:absolute;right:-34px;top:5px;color:#ffe56e;font-weight:1000;font-size:12px;text-shadow:0 2px 5px #000}
@keyframes catcherReceive{0%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(.94) translateY(4px)}100%{transform:translateX(-50%) scale(1)}}
@keyframes umpireStrike{0%{transform:translateX(-50%) rotate(0)}45%{transform:translateX(-50%) rotate(-7deg) translateY(-2px)}100%{transform:translateX(-50%) rotate(0)}}
.pitch-mode-top{flex-wrap:wrap}.pitch-chart-btn{border:1px solid #45696a;background:#143a3c;color:#dce9e5;border-radius:9px;padding:5px 8px;font-size:10px;font-weight:900}.pitch-defense-actions{display:flex;gap:6px;overflow-x:auto;margin-bottom:5px;scrollbar-width:none}.pitch-defense-actions:empty{display:none}.pitch-defense-actions::-webkit-scrollbar{display:none}.pitch-mini-action{flex:0 0 auto;border:1px solid #45696a;background:#15383a;color:#e4efec;border-radius:9px;padding:6px 9px;font-size:10px;font-weight:900}.pitch-mini-action.pickoff{background:#3b3020;border-color:#756035;color:#ffe19b}.pitch-type{display:flex;align-items:center;justify-content:center;gap:5px}.pitch-grade{display:inline-grid;place-items:center;width:21px;height:21px;border-radius:50%;font-size:9px;background:#061b1c;color:#ffe177;border:1px solid #58706d}.pitch-type.active .pitch-grade{background:#4a3400;color:#ffe37b;border-color:#6b4c00}
.offense-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.offense-actions button{min-height:42px;padding:6px!important}.offense-call-status{font-size:11px;color:#ffe079;margin-top:7px}.resume-game{margin-top:8px;width:100%;background:#173f42!important}.resume-info{margin-top:6px;font-size:11px;color:#a9bfba;text-align:center}.pitchchart-modal{max-width:540px}.pitchchart-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;width:min(270px,80vw);margin:12px auto}.pitchchart-cell{aspect-ratio:1;border:1px solid #527071;background:#0b3031;border-radius:9px;display:grid;place-items:center;text-align:center;font-size:10px;color:#acc3be}.pitchchart-cell b{display:block;font-size:20px;color:#ffe071}.pitchchart-summary{text-align:center;color:#abc0bc;font-size:11px}.pitch-log-list{display:grid;gap:5px;margin-top:12px;max-height:220px;overflow:auto}.pitch-log-row{display:grid;grid-template-columns:58px 1fr auto;gap:7px;align-items:center;border-bottom:1px solid #284647;padding:6px 2px;font-size:11px}.pitch-log-row b{color:#ffe079}.pitch-log-result{font-weight:900;color:#bfe6d5}.strategy-live{color:#ffe36d!important}.tag-flash{animation:tagFlash .5s ease}@keyframes tagFlash{0%{filter:brightness(1)}50%{filter:brightness(1.55)}100%{filter:brightness(1)}}
@media(max-width:620px){.plateFigure{opacity:.55}.catcher{bottom:4%;transform:translateX(-50%) scale(.82)}.umpire{bottom:3.4%;transform:translateX(-50%) scale(.78)}.offense-actions{grid-template-columns:1fr 1fr}.offense-actions button:last-child{grid-column:1/-1}.pitch-chart-btn{padding:4px 6px}}
'''
rep('</style>',css+'\n</style>')

# ===== setup resume button =====
rep('<button id="startGameBtn" class="primary" style="width:100%" disabled>選滿 9 人後開始比賽</button>', '<button id="startGameBtn" class="primary" style="width:100%" disabled>選滿 9 人後開始比賽</button><button id="resumeGameBtn" class="secondary resume-game hidden">▶ 繼續上一場比賽</button><div id="resumeGameInfo" class="resume-info hidden"></div>')

# ===== pitching top controls =====
old_panel='<div id="pitchModePanel" class="pitch-mode-panel hidden"><div class="pitch-mode-top"><strong id="userPitcherLabel">你的投手</strong><span id="cpuBatterLabel">對手打者</span></div><div id="pitchTypeButtons" class="pitch-types"></div><div class="pitch-help">先選球種 → 拖曳九宮格瞄準 → 按「投球！」</div></div>'
new_panel='<div id="pitchModePanel" class="pitch-mode-panel hidden"><div class="pitch-mode-top"><strong id="userPitcherLabel">你的投手</strong><span id="cpuBatterLabel">對手打者</span><button id="pitchChartBtn" class="pitch-chart-btn">九宮格配球圖</button></div><div id="pitchDefenseActions" class="pitch-defense-actions"></div><div id="pitchTypeButtons" class="pitch-types"></div><div class="pitch-help">先選球種 → 拖曳九宮格瞄準 → 按「投球！」</div></div>'
rep(old_panel,new_panel)

# ===== catcher + umpire =====
rep('    <div id="batter" class="batter">', '    <div id="umpire" class="plateFigure umpire"><div class="ph"></div><div class="pb"></div></div>\n    <div id="catcher" class="plateFigure catcher"><div class="ph"></div><div class="pb"></div></div>\n\n    <div id="batter" class="batter">')

# ===== tactics offensive box =====
tactic_anchor='<div id="userPitcherStatus" class="bench-count"></div></div></div><div class="modal-actions"><button id="closeTactics" class="primary" style="grid-column:1/-1">回到比賽</button></div>'
tactic_new='<div id="userPitcherStatus" class="bench-count"></div></div><div id="offenseTacticBox" class="tactic-box"><h3>進攻戰術</h3><div class="offense-actions"><button id="buntCallBtn" class="secondary">短打</button><button id="hitRunCallBtn" class="secondary">打帶跑</button><button id="stealCallBtn" class="secondary">盜壘</button></div><div id="offenseCallStatus" class="offense-call-status">目前：正常進攻</div></div></div><div class="modal-actions"><button id="closeTactics" class="primary" style="grid-column:1/-1">回到比賽</button></div>'
rep(tactic_anchor,tactic_new)

# ===== pitch chart overlay =====
chart_overlay='''<div id="pitchChartOverlay" class="overlay hidden"><div class="modal pitchchart-modal"><h2>九宮格配球圖</h2><div class="sub">本場你投出的球會累積在九宮格；可用來檢查自己是否一直投同一區。</div><div id="pitchChartGrid" class="pitchchart-grid"></div><div id="pitchChartSummary" class="pitchchart-summary"></div><div id="pitchLogList" class="pitch-log-list"></div><div class="modal-actions"><button id="closePitchChart" class="primary" style="grid-column:1/-1">回到比賽</button></div></div></div>\n'''
rep('<div id="recordsOverlay" class="overlay hidden">',chart_overlay+'<div id="recordsOverlay" class="overlay hidden">')

# ===== state variables =====
rep("const STATS_KEY='cpblFantasyGameStatsV6',LINEUP_KEY='cpblFantasyLineupV6',POS_KEY='cpblFantasyPositionsV6',CFG_KEY='cpblFantasyConfigV6';", "const STATS_KEY='cpblFantasyGameStatsV6',LINEUP_KEY='cpblFantasyLineupV6',POS_KEY='cpblFantasyPositionsV6',CFG_KEY='cpblFantasyConfigV6',GAME_SAVE_KEY='cpblFantasyLiveGameV13';")
rep("let halfMode='bat',cpuBatIndex=0,selectedUserPitch='FF';", "let halfMode='bat',cpuBatIndex=0,selectedUserPitch='FF',offenseCall='normal',pitchHistory=[],currentPitchLogEntry=null;")

# ===== mastery / memory / save / plate helpers inserted before showIntro =====
helpers=r'''
function pitchMastery(p,code){const r=pitcherRatings(p),id=playerId(p);let score=55+h01(id,'master-'+code)*30;if(code==='FF')score+=(r.velo-65)*.34+(r.control-65)*.10;else if(code==='SI'||code==='CT')score+=(r.control-62)*.22+(r.break-62)*.20;else score+=(r.break-62)*.31+(r.control-62)*.13;score=clamp(Math.round(score),48,97);const grade=score>=91?'S':score>=83?'A':score>=74?'B':score>=64?'C':'D';return{score,grade}}
function zoneBucket(x,y){if(x<0||x>1||y<0||y>1)return'OUT';return Math.min(2,Math.floor(y*3))*3+Math.min(2,Math.floor(x*3))}
function cpuReadBonus(batter,code=selectedUserPitch,x=aimX,y=aimY){if(!batter)return 0;const recent=pitchHistory.filter(e=>e.batter===batter.name).slice(-7);if(recent.length<2)return 0;const same=recent.filter(e=>e.code===code).length,zb=zoneBucket(x,y),sameZone=recent.filter(e=>zoneBucket(e.x,e.y)===zb).length;return clamp(Math.max(0,same-2)*.035+Math.max(0,sameZone-2)*.022,0,.16)}
function finalizeUserPitch(result){if(!currentPitchLogEntry)return;currentPitchLogEntry.x=pitchTargetX;currentPitchLogEntry.y=pitchTargetY;currentPitchLogEntry.speed=lastSpeed;currentPitchLogEntry.result=result;pitchHistory.push(currentPitchLogEntry);pitchHistory=pitchHistory.slice(-160);currentPitchLogEntry=null;saveGameState()}
function plateReceive(kind='ball'){const c=$('catcher'),u=$('umpire');if(c){c.classList.remove('receive');void c.offsetWidth;c.classList.add('receive');gameSetTimeout(()=>c.classList.remove('receive'),300)}if(u&&kind==='strike'){u.classList.remove('callStrike');void u.offsetWidth;u.classList.add('callStrike');gameSetTimeout(()=>u.classList.remove('callStrike'),430)}}
function updateOffenseCallUi(){if($('offenseCallStatus'))$('offenseCallStatus').textContent='目前：'+(offenseCall==='bunt'?'短打':offenseCall==='hitrun'?'打帶跑':'正常進攻');if($('swingBtn')&&halfMode==='bat'){$('swingBtn').textContent=offenseCall==='bunt'?'短打！':offenseCall==='hitrun'?'打帶跑！':'揮棒！';$('swingBtn').classList.toggle('strategy-live',offenseCall!=='normal')}}
function catcherArmRating(){const c=lineup.find(p=>positionMap[playerId(p)]==='C');return c?gameRatings(c).arm:68}
function renderPitchDefenseActions(){const box=$('pitchDefenseActions');if(!box||halfMode!=='pitch'){if(box)box.innerHTML='';return}const btn=[];if(bases[0])btn.push('<button class="pitch-mini-action pickoff" data-pickoff="0">牽制一壘</button>');if(bases[1])btn.push('<button class="pitch-mini-action pickoff" data-pickoff="1">牽制二壘</button>');box.innerHTML=btn.join('');qsa('[data-pickoff]').forEach(b=>b.onclick=()=>attemptPickoff(Number(b.dataset.pickoff)))}
function attemptPickoff(i){if(paused||pitching||halfMode!=='pitch'||!bases[i]||i>1)return;const r=bases[i],pr=currentPitcherRatings(userPitcher),hold=clamp(.045+(pr.control-55)*.0018+(90-r.speed)*.0012,.025,.16);if(Math.random()<hold){bases[i]=null;outs++;setMsg('牽制成功！',`${r.player.name} 回壘不及，遭觸殺`,'good');sfx('out');$('scene').classList.add('tag-flash');gameSetTimeout(()=>$('scene').classList.remove('tag-flash'),500)}else setMsg('牽制安全',`${r.player.name} 及時回壘`,'');updateBoard();renderPitchDefenseActions();saveGameState();if(outs>=3)return endHalf()}
function maybeCpuSteal(){if(halfMode!=='pitch'||pitching)return false;let i=bases[1]&&!bases[2]?1:(bases[0]&&!bases[1]?0:-1);if(i<0)return false;const r=bases[i],chance=clamp(.025+Math.max(0,r.speed-65)*.0035+(i===1?.025:0),.02,.16);if(Math.random()>chance)return false;const pr=currentPitcherRatings(userPitcher),arm=catcherArmRating(),prob=clamp(.59+(r.speed-68)*.006-(arm-68)*.0045-(pr.control-68)*.002,.28,.90);bases[i]=null;if(Math.random()<prob){bases[i+1]=r;setMsg('對手盜壘成功',`${r.player.name} 搶下${i+2}壘`,'bad');sfx('hit')}else{outs++;setMsg('盜壘阻殺！',`捕手傳球觸殺 ${r.player.name}`,'good');sfx('out');$('scene').classList.add('tag-flash');gameSetTimeout(()=>$('scene').classList.remove('tag-flash'),500)}updateBoard();renderPitchDefenseActions();saveGameState();if(outs>=3)endHalf();return true}
function attemptUserSteal(fromHitRun=false){if(halfMode!=='bat'||pitching)return{attempted:false,ended:false};let i=bases[1]&&!bases[2]?1:(bases[0]&&!bases[1]?0:-1);if(i<0){if(!fromHitRun)setMsg('無法盜壘','目前沒有可前進的跑者','');return{attempted:false,ended:false}}const r=bases[i],pr=cpuPitcher?currentPitcherRatings(cpuPitcher):{control:68},arm=cpuArmRating(),prob=clamp(.61+(r.speed-68)*.0065-(arm-68)*.004-(pr.control-68)*.0022,.30,.91);bases[i]=null;if(Math.random()<prob){bases[i+1]=r;setMsg('盜壘成功！',`${r.player.name} 搶下${i+2}壘`,'good');sfx('hit')}else{outs++;setMsg('盜壘失敗',`${r.player.name} 遭捕手傳球觸殺`,'bad');sfx('out');$('scene').classList.add('tag-flash');gameSetTimeout(()=>$('scene').classList.remove('tag-flash'),500)}updateBoard();saveGameState();if(outs>=3){endHalf();return{attempted:true,ended:true}}return{attempted:true,ended:false}}
function renderPitchChart(){const cells=Array.from({length:9},()=>0);let out=0;pitchHistory.forEach(e=>{const z=zoneBucket(e.x,e.y);if(z==='OUT')out++;else cells[z]++});$('pitchChartGrid').innerHTML=cells.map((n,i)=>`<div class="pitchchart-cell"><span>${i+1}區<b>${n}</b></span></div>`).join('');$('pitchChartSummary').textContent=`本場 ${pitchHistory.length} 球・好球帶外 ${out} 球`;$('pitchLogList').innerHTML=pitchHistory.slice(-16).reverse().map(e=>`<div class="pitch-log-row"><b>${e.pitch}</b><span>${e.speed||'—'} km/h・${e.batter||'—'}</span><span class="pitch-log-result">${e.result||'—'}</span></div>`).join('')||'<div class="empty-note">還沒有投球紀錄</div>'}
function pitcherStateData(st){return st?{id:playerId(st.player),pitches:st.pitches||0,innings:st.innings||0,role:st.role||''}:null}
function restorePitcherState(d){if(!d)return null;const p=players.find(x=>playerId(x)===d.id);return p?{player:p,pitches:d.pitches||0,innings:d.innings||0,role:d.role||staffRole(d.id)}:null}
function runnerData(r){return r?{id:playerId(r.player),lineupIndex:r.lineupIndex,speed:r.speed}:null}
function restoreRunner(d){if(!d)return null;const p=players.find(x=>playerId(x)===d.id);return p?{player:p,lineupIndex:d.lineupIndex,speed:d.speed??gameRatings(p).speed}:null}
function saveGameState(){if(!playing)return;try{localStorage.setItem(GAME_SAVE_KEY,JSON.stringify({savedAt:Date.now(),inning,userScore,cpuScore,balls,strikes,outs,batIndex,cpuBatIndex,halfMode,opponent,aimX,aimY,selectedUserPitch,offenseCall,pitchHistory,lineupIds:lineup.map(playerId),positionMap,config,userPitcher:pitcherStateData(userPitcher),cpuPitcher:pitcherStateData(cpuPitcher),bases:bases.map(runnerData),usedBatters:[...usedBatters],usedPitchers:[...usedPitchers],cpuPitcherUsed:[...cpuPitcherUsed],substitutions}))}catch(e){console.warn('save game failed',e)}refreshResumeButton()}
function clearGameSave(){localStorage.removeItem(GAME_SAVE_KEY);refreshResumeButton()}
function refreshResumeButton(){const b=$('resumeGameBtn'),info=$('resumeGameInfo');if(!b||!info)return;let g=null;try{g=JSON.parse(localStorage.getItem(GAME_SAVE_KEY)||'null')}catch{}const ok=!!g?.lineupIds?.length;b.classList.toggle('hidden',!ok);info.classList.toggle('hidden',!ok);if(ok)info.textContent=`${g.inning}局${g.halfMode==='pitch'?'上':'下'}・明星隊 ${g.userScore}：${g.cpuScore} ${teams[g.opponent]?.short||''}・${new Date(g.savedAt).toLocaleString('zh-TW')}`}
function resumeSavedGame(){let g;try{g=JSON.parse(localStorage.getItem(GAME_SAVE_KEY)||'null')}catch{}if(!g)return;clearAllGameTimers();resetPauseUi();lineup=(g.lineupIds||[]).map(id=>players.find(p=>playerId(p)===id)).filter(Boolean);if(lineup.length!==9){clearGameSave();return}positionMap=g.positionMap||positionMap;config=Object.assign(config,g.config||{});opponent=g.opponent||opponent;inning=g.inning||1;userScore=g.userScore||0;cpuScore=g.cpuScore||0;balls=g.balls||0;strikes=g.strikes||0;outs=g.outs||0;batIndex=g.batIndex||0;cpuBatIndex=g.cpuBatIndex||0;halfMode=g.halfMode||'pitch';aimX=g.aimX??.5;aimY=g.aimY??.5;selectedUserPitch=g.selectedUserPitch||'FF';offenseCall=g.offenseCall||'normal';pitchHistory=Array.isArray(g.pitchHistory)?g.pitchHistory:[];userPitcher=restorePitcherState(g.userPitcher);cpuPitcher=restorePitcherState(g.cpuPitcher);bases=(g.bases||[null,null,null]).map(restoreRunner);usedBatters=new Set(g.usedBatters||lineup.map(playerId));usedPitchers=new Set(g.usedPitchers||[]);cpuPitcherUsed=new Set(g.cpuPitcherUsed||[]);substitutions=Array.isArray(g.substitutions)?g.substitutions:[];pendingRunDecision=null;pitching=false;playing=true;initAudio();$('setupApp').classList.add('hidden');$('gameApp').classList.remove('hidden');$('aim').style.left=aimX*100+'%';$('aim').style.top=aimY*100+'%';const park=currentPark();$('scoreboardBig').textContent=park.name.toUpperCase();$('scene').classList.toggle('indoor',!!park.roof);setHalfMode(halfMode);updateBoard();updateOffenseCallUi();showIntro();setMsg('繼續上一場',`${inning}局${halfMode==='pitch'?'上':'下'}・${outs}人出局`,'');if(halfMode==='bat')schedulePitch(700);else{renderUserPitchControls();$('userPitchBtn').disabled=false}saveGameState()}
'''
rep('function showIntro(){',helpers+'\nfunction showIntro(){')

# load data should reveal resume button
rep('ensurePositions();renderFilters();renderPitcherFilters();renderPool();renderLineup();renderConfig();renderOpponent();}', 'ensurePositions();renderFilters();renderPitcherFilters();renderPool();renderLineup();renderConfig();renderOpponent();refreshResumeButton();}')

# ===== user pitch controls with mastery + pickoff + batter memory =====
new_render=r'''function renderUserPitchControls(){if(!userPitcher)return;const pr=currentPitcherRatings(userPitcher),rep=pr.repertoire||['FF'];if(!rep.includes(selectedUserPitch))selectedUserPitch=rep[0];$('pitchTypeButtons').innerHTML=rep.map(code=>{const p=basePitchTypes[code],m=pitchMastery(userPitcher.player,code);return p?`<button class="pitch-type ${selectedUserPitch===code?'active':''}" data-user-pitch="${code}"><span>${p.n}</span><b class="pitch-grade">${m.grade}</b></button>`:''}).join('');qsa('[data-user-pitch]').forEach(b=>b.onclick=()=>{selectedUserPitch=b.dataset.userPitch;renderUserPitchControls()});const read=cpuReadBonus(currentCpuBatter(),selectedUserPitch,aimX,aimY);$('userPitcherLabel').textContent=`${userPitcher.player.name}・${userPitcher.role}｜${rep.length}種球・${pr.repertoireSource||'遊戲模型'}`;$('cpuBatterLabel').textContent=`${currentCpuBatter()?.name||'—'}｜${userPitcher.pitches}球${read>.07?'・打者開始讀配球':''}`;const fat=pitcherFatigue(userPitcher);$('userPitchBtn').disabled=pitching;$('userPitchBtn').textContent=fat>.82?'投球（疲勞）':'投球！';renderPitchDefenseActions()}'''
replace_between('function renderUserPitchControls(){','function startPitchHalf',new_render)

# start halves save and reset offensive call when appropriate
rep("function startPitchHalf(first=false){clearMotion();setHalfMode('pitch');", "function startPitchHalf(first=false){clearMotion();offenseCall='normal';updateOffenseCallUi();setHalfMode('pitch');")
rep("renderUserPitchControls();$('userPitchBtn').disabled=false}", "renderUserPitchControls();$('userPitchBtn').disabled=false;saveGameState()}",1)
rep("function startBatHalf(){clearMotion();setHalfMode('bat');", "function startBatHalf(){clearMotion();offenseCall='normal';setHalfMode('bat');")
rep("showIntro();schedulePitch(900)}", "showIntro();updateOffenseCallUi();saveGameState();schedulePitch(900)}",1)

# ===== user throwing: pitch mastery + CPU steal + log entry =====
new_user_throw=r'''function userThrowPitch(){if(paused||!playing||halfMode!=='pitch'||pitching||!userPitcher)return;if(maybeCpuSteal())return;const pr=currentPitcherRatings(userPitcher),fat=pitcherFatigue(userPitcher),code=selectedUserPitch,pt=basePitchTypes[code]||basePitchTypes.FF,m=pitchMastery(userPitcher.player,code);lastPitch=pt.n;const fast=136+pr.velo*.22-fat*5;lastSpeed=Math.round(fast+pt.delta+rand(-1.6,1.6)+((code==='FF'||code==='SI')?(m.score-72)*.025:0));pitchDuration=clamp(720+(150-lastSpeed)*3.5,680,930);const missBase=clamp((100-pr.control)/290+fat*.13,.018,.22),miss=missBase*clamp(1.13-(m.score-55)*.0048,.70,1.05);pitchTargetX=clamp(aimX+rand(-miss,miss),-.30,1.30);pitchTargetY=clamp(aimY+rand(-miss,miss),-.30,1.30);const breakScale=(.65+pr.break/100)*(.82+m.score/310);pitchCurve=(pitchTargetX<.5?-1:1)*pt.c*breakScale;pitchDrop=pt.drop*breakScale;currentPitchLogEntry={code,pitch:pt.n,batter:currentCpuBatter()?.name||'—',x:pitchTargetX,y:pitchTargetY,speed:lastSpeed,result:''};pitchStart=0;pitching=true;userPitcher.pitches++;$('userPitchBtn').disabled=true;$('tacticsBtn').disabled=true;$('pitchInfo').textContent=lastPitch+' '+lastSpeed+' km/h・'+m.grade+'級';const pitcher=$('pitcher');pitcher.classList.remove('windup','release');void pitcher.offsetWidth;pitcher.classList.add('windup');sfx('pitch');timer=gameSetTimeout(()=>{pitcher.classList.remove('windup');pitcher.classList.add('release');pitchStart=performance.now();$('ball').style.display='block';$('ballShadow').style.display='block';raf=requestAnimationFrame(animatePitch)},430)}'''
replace_between('function userThrowPitch(){','function cpuTakeOrSwing',new_user_throw)

# CPU recognition in swing decision
new_take_or_swing=r'''function cpuTakeOrSwing(batter){const r=gameRatings(batter),inZone=strikeLoc(),edge=Math.min(Math.abs(pitchTargetX-.5),Math.abs(pitchTargetY-.5)),eye=r.eye||65,read=cpuReadBonus(batter,selectedUserPitch,pitchTargetX,pitchTargetY);let swingProb=inZone?clamp(.70+(strikes===2?.14:0)-edge*.08+read*.55,.58,.97):clamp(.30-(eye-60)*.003+(strikes===2?.09:0)+read*.28,.10,.55);return Math.random()<swingProb}'''
replace_between('function cpuTakeOrSwing','function cpuBattedMetrics',new_take_or_swing)

# CPU ground-ball double play
new_cpu_outcome=r'''function cpuBallOutcome(batter,q,b){const s=batter.stats||{},avg=num(s.AVG)??.255,slg=num(s.SLG)??.390,hr=num(s.HR)||0,pa=Math.max(1,num(s.PA)||1),def=defenseRating();if(b.launch<7&&bases[0]&&outs<2){const dp=clamp(.31+(def-68)*.006-(gameRatings(batter).speed-65)*.003,.14,.62);if(Math.random()<dp)return{result:'DP',label:'內野滾地雙殺'}}let hit=clamp(avg+(q-.55)*.18-(def-68)*.0022,.12,.47);if(Math.random()>hit)return{result:'OUT',label:b.launch<7?'內野滾地出局':b.launch>24?'外野高飛球接殺':'平飛球出局'};const hrp=clamp((hr/pa)*2.1+Math.max(0,slg-.43)*.12+Math.max(0,q-.72)*.08,.005,.17);if(b.launch>13&&b.launch<42&&b.distance>b.fence*.94&&Math.random()<Math.max(hrp,.08))return{result:'HR',label:'對手全壘打'};const extra=clamp((slg-avg)*.60+.04,.08,.30),r=Math.random();if(r<extra*.10&&gameRatings(batter).speed>75)return{result:'3B',label:'對手三壘安打'};if(r<extra)return{result:'2B',label:'對手二壘安打'};return{result:'1B',label:'對手安打'}}'''
replace_between('function cpuBallOutcome','function resolveCpuPitch',new_cpu_outcome)

# CPU at-bat resolution with pitch log + memory
new_resolve_cpu=r'''function resolveCpuPitch(){if(halfMode!=='pitch')return;const batter=currentCpuBatter();if(!batter)return endHalf();const swing=cpuTakeOrSwing(batter);if(!swing){sfx('catch');if(strikeLoc()){plateReceive('strike');strikes++;setMsg('好球！',`${batter.name} 沒出棒・${lastPitch} ${lastSpeed} km/h`,'good');finalizeUserPitch('好球看');if(strikes>=3)return completeCpuPA('K','三振！')}else{plateReceive('ball');balls++;setMsg('壞球',`${batter.name} 忍住沒揮`,'');finalizeUserPitch('壞球');if(balls>=4)return completeCpuPA('BB','四壞保送')}updateBoard();renderUserPitchControls();$('userPitchBtn').disabled=false;return}const batterEl=$('batter'),bat=$('bat');batterEl.classList.add('swing');bat.classList.add('swing');gameSetTimeout(()=>{batterEl.classList.remove('swing');bat.classList.remove('swing')},240);const pr=currentPitcherRatings(userPitcher),r=gameRatings(batter),locPenalty=strikeLoc()?Math.hypot(pitchTargetX-.5,pitchTargetY-.5)*.12:.16,read=cpuReadBonus(batter,selectedUserPitch,pitchTargetX,pitchTargetY),m=pitchMastery(userPitcher.player,selectedUserPitch);const q=clamp(.54+(r.contact-65)*.006-(pr.velo-70)*.003-(pr.break-70)*.003-(m.score-72)*.0018-locPenalty+read+rand(-.22,.22),0,1);if(q<.25){plateReceive('strike');strikes++;setMsg('揮空！',`${batter.name} 沒跟上 ${lastPitch}`,'good');sfx('out');finalizeUserPitch('揮空');if(strikes>=3)return completeCpuPA('K','揮空三振！');updateBoard();renderUserPitchControls();$('userPitchBtn').disabled=false;return}if(Math.random()<clamp(.23-q*.10,.08,.22)){plateReceive('strike');if(strikes<2)strikes++;setMsg('界外球',`${batter.name} 擊成界外`,'');finalizeUserPitch('界外');updateBoard();renderUserPitchControls();$('userPitchBtn').disabled=false;return}const b=cpuBattedMetrics(batter,q),o=cpuBallOutcome(batter,q,b);lastBattedBall=b;finalizeUserPitch(o.result==='DP'?'雙殺':o.result==='OUT'?'出局':o.label);sfx('bat');showCpuHitThen(o.result,o.label,b,batter)}'''
replace_between('function resolveCpuPitch','function showCpuHitThen',new_resolve_cpu)

# CPU complete PA supports double play
new_complete_cpu=r'''function completeCpuPA(result,label=''){const batter=currentCpuBatter();let runs=0;if(result==='DP'){outs+=2;bases[0]=null;label=label||'雙殺！'}else if(result==='K'||result==='OUT')outs++;else runs=cpuAdvance(result,batter);cpuScore+=runs;cpuBatIndex=(cpuBatIndex+1)%Math.max(1,cpuBattingOrder().length);balls=strikes=0;setMsg(label||result,(runs?runs+' 分・':'')+batter.name,result==='K'||result==='OUT'||result==='DP'?'good':'bad');updateBoard();saveGameState();if(outs>=3)return endHalf();showIntro();renderUserPitchControls();$('userPitchBtn').disabled=false}'''
replace_between('function completeCpuPA',"$('userPitchBtn').addEventListener",new_complete_cpu)

# ===== batting: take pitch / bunt / hit-run =====
new_take_pitch=r'''function takePitch(){sfx('catch');const inZone=strikeLoc();plateReceive(inZone?'strike':'ball');if(inZone){strikes++;setMsg('好球！',lastPitch+' '+lastSpeed+' km/h','bad');if(strikes>=3)return finishPA('K')}else{balls++;setMsg('壞球',lastPitch+' '+lastSpeed+' km/h','');if(balls>=4)return finishPA('BB')}updateBoard();saveGameState();if(offenseCall==='hitrun'){const st=attemptUserSteal(true);offenseCall='normal';updateOffenseCallUi();if(st.ended)return}maybeCpuPitchChange();schedulePitch(820)}
function buntSwing(){if(paused||halfMode!=='bat'||!playing||!pitching)return;const p=currentPlayer(),s=currentStat(),t=clamp((performance.now()-pitchStart)/pitchDuration,0,1),timingErr=Math.abs(t-.89),aimErr=Math.hypot(aimX-pitchTargetX,aimY-pitchTargetY);pitching=false;$('tacticsBtn').disabled=false;if(raf)cancelAnimationFrame(raf);$('ball').style.display='none';$('ballShadow').style.display='none';if(timingErr>.25||aimErr>.76||Math.random()<.10){plateReceive('strike');if(strikes>=2){offenseCall='normal';updateOffenseCallUi();return finishPA('K')}strikes++;setMsg('短打落空／界外','短打失敗，記一好球','bad');updateBoard();saveGameState();return schedulePitch(820)}const speed=gameRatings(p).speed,hitChance=clamp(.08+(speed-60)*.004+(aimErr<.24?.05:0),.05,.24);if(Math.random()<hitChance){offenseCall='normal';updateOffenseCallUi();lastBattedBall={exit:clamp(55+speed*.2+rand(-3,3),55,78),launch:rand(-8,2),spray:rand(-26,26),distance:rand(35,90),hang:.65,targetX:rand(37,63),targetY:rand(61,74),fence:330};sfx('bat');return showHitThen('1B','短打安打',lastBattedBall)}const pre=[...bases];let runs=0;if(pre[2])runs++;bases=[null,pre[0],pre[1]];s.PA++;if(!pre.some(Boolean))s.AB++;s.RBI+=runs;userScore+=runs;outs++;batIndex=(batIndex+1)%9;balls=strikes=0;offenseCall='normal';updateOffenseCallUi();setMsg('犧牲短打成功',`${p.name} 推進跑者${runs?'・送回 '+runs+' 分':''}`,'good');updateBoard();saveDb();saveGameState();if(inning===9&&userScore>cpuScore)return endGame('再見勝！');if(outs>=3)return endHalf();showIntro();schedulePitch(1050)}'''
replace_between('function takePitch','function swing',new_take_pitch)

new_swing=r'''function swing(){if(paused||halfMode!=='bat'||!playing||!pitching)return;if(offenseCall==='bunt')return buntSwing();const wasHitRun=offenseCall==='hitrun',batter=$('batter'),bat=$('bat');batter.classList.add('swing');bat.classList.add('swing');gameSetTimeout(()=>{batter.classList.remove('swing');bat.classList.remove('swing')},240);const t=clamp((performance.now()-pitchStart)/pitchDuration,0,1),timingErr=Math.abs(t-.89),aimErr=Math.hypot(aimX-pitchTargetX,aimY-pitchTargetY);pitching=false;$('tacticsBtn').disabled=false;if(raf)cancelAnimationFrame(raf);$('ball').style.display='none';$('ballShadow').style.display='none';if(timingErr>.23||aimErr>.72){plateReceive('strike');strikes++;setMsg('揮空！','時機或準星位置沒對上','bad');sfx('out');if(wasHitRun){const st=attemptUserSteal(true);offenseCall='normal';updateOffenseCallUi();if(st.ended)return}if(strikes>=3)return finishPA('K');updateBoard();saveGameState();return schedulePitch(820)}const tq=clamp(1-timingErr/.20,0,1),aq=clamp(1-aimErr/.56,0,1),contact=tq*.58+aq*.42;resolvePhysics(contact,t,aimErr)}'''
replace_between('function swing','function fenceDistance',new_swing)

# batting double plays
new_physics=r'''function physicsOutcome(b){if(Math.abs(b.spray)>49)return{result:'FOUL',label:'界外球'};if(b.launch>14&&b.launch<43&&b.distance>b.fence)return{result:'HR',label:'全壘打'};const def=cpuDefenseRating(),arm=cpuArmRating(),gap=Math.abs(Math.abs(b.spray)-23),r=Math.random();if(b.launch<7){const outProb=clamp(.79+(def-68)*.006-(b.exit-82)*.008-gap*.002,.22,.92);if(bases[0]&&outs<2&&offenseCall!=='hitrun'&&r<outProb&&Math.random()<clamp(.34+(def-68)*.005-(gameRatings(currentPlayer()).speed-65)*.0025,.16,.58))return{result:'DP',label:'滾地球形成雙殺'};if(r<outProb)return{result:'OUT',label:b.exit>98?'強勁滾地球刺殺':'內野滾地出局'};if(b.distance>150&&gameRatings(currentPlayer()).speed>82&&Math.random()<.16)return{result:'2B',label:'穿越內野形成二壘打'};return{result:'1B',label:'穿越安打'}}const catchProb=clamp(.30+(b.hang-1.5)*.19+(def-68)*.009-(b.distance-250)*.0014+(gap<8?-.10:0),.08,.91);if(r<catchProb)return{result:'OUT',label:b.launch>24?'外野高飛球接殺':'平飛球接殺'};const spd=gameRatings(currentPlayer()).speed;if(b.distance>330&&gap<13&&spd>78&&Math.random()<.24)return{result:'3B',label:'深遠三壘安打'};if(b.distance>215||b.exit>101||arm<60)return{result:'2B',label:'二壘安打'};return{result:'1B',label:'安打'}}'''
replace_between('function physicsOutcome','function resolvePhysics',new_physics)

new_resolve_physics=r'''function resolvePhysics(contact,timing,aimErr){const a=battingAbility();if(offenseCall==='hitrun')contact+=.065;contact=clamp(contact+a.contact*.045+a.power*.025*Math.max(0,(contact-.35)/.65),0,1);if(contact<.21&&Math.random()<.55)return foul();const b=battedBallMetrics(contact,timing,aimErr),o=physicsOutcome(b);lastBattedBall=b;if(o.result==='FOUL')return foul();sfx('bat');showHitThen(o.result,o.label,b)}'''
replace_between('function resolvePhysics','function resetHitCamera',new_resolve_physics)

# hit camera treat DP as an out and show relay sequence
seg_start=s.index('function showHitThen')
seg_end=s.index('\nfunction foul',seg_start)
seg=s[seg_start:seg_end]
seg=seg.replace("result==='OUT'?0", "(result==='OUT'||result==='DP')?0")
seg=seg.replace("if(result==='OUT'&&fielder)", "if((result==='OUT'||result==='DP')&&fielder)")
seg=seg.replace("else if(result!=='OUT'&&!isHr&&fielder)", "else if(result!=='OUT'&&result!=='DP'&&!isHr&&fielder)")
seg=seg.replace("else if(result!=='OUT')sfx('hit');else sfx('out')", "else if(result!=='OUT'&&result!=='DP')sfx('hit');else sfx('out')")
seg=seg.replace("ground&&result==='OUT'", "ground&&(result==='OUT'||result==='DP')")
seg=seg.replace("if(ground){animateRelay(target[0],target[1],70,71,0,360);splash.textContent='傳一壘刺殺';", "if(ground){if(result==='DP'){animateRelay(target[0],target[1],50,55,0,300);animateRelay(50,55,70,71,300,360);splash.textContent='雙殺守備！'}else{animateRelay(target[0],target[1],70,71,0,360);splash.textContent='傳一壘刺殺';}")
s=s[:seg_start]+seg+s[seg_end:]

# foul saves count state
rep("function foul(){if(strikes<2)strikes++;setMsg('界外球','繼續這個打席','');updateBoard();maybeCpuPitchChange();schedulePitch(820)}", "function foul(){if(strikes<2)strikes++;setMsg('界外球','繼續這個打席','');updateBoard();saveGameState();maybeCpuPitchChange();schedulePitch(820)}")

# aggressive hit-and-run advancement
old_apply_start='function applyAdvance(type,batter,choice)'
a=s.index(old_apply_start); b=s.index('\nfunction finishPA',a)
old=s[a:b]
old=old.replace("const pre=[...bases],br=runnerObj(batter,batIndex%9),d=baserunDecision(type);", "const pre=[...bases],br=runnerObj(batter,batIndex%9),d=baserunDecision(type),hitRun=offenseCall==='hitrun';")
old=old.replace("}else if(Math.random()<.68)runs++;else n[2]=pre[1]", "}else if(hitRun||Math.random()<.68)runs++;else n[2]=pre[1]")
old=old.replace("}else n[1]=pre[0]", "}else if(hitRun&&!n[2])n[2]=pre[0];else n[1]=pre[0]")
old=old.replace("}else if(Math.random()<.55)runs++;else n[2]=pre[0]", "}else if(hitRun||Math.random()<.55)runs++;else n[2]=pre[0]")
s=s[:a]+old+s[b:]

# complete player PA supports DP and resets strategy
new_complete=r'''function completePA(result,label='',choice='hold'){const p=currentPlayer(),s=currentStat();s.PA++;let runs=0,extraOut=false;if(result==='K'){s.AB++;s.K++;outs++;label='三振出局'}else if(result==='BB'){s.BB++;({runs,extraOut}=applyAdvance('BB',p,choice));label='四壞保送'}else if(result==='DP'){s.AB++;outs+=2;bases[0]=null;label='雙殺打'}else if(result==='OUT'){s.AB++;outs++}else{s.AB++;s.H++;if(result==='2B')s.D2++;if(result==='3B')s.D3++;if(result==='HR')s.HR++;({runs,extraOut}=applyAdvance(result,p,choice));s.RBI+=runs;label=result==='1B'?'安打！':result==='2B'?'二壘安打！':result==='3B'?'三壘安打！':'全壘打！！！'}userScore+=runs;offenseCall='normal';updateOffenseCallUi();setMsg(extraOut?'跑壘遭觸殺！':label,(runs?runs+' 分打點・':'')+p.name,extraOut||result==='OUT'||result==='K'||result==='DP'?'bad':'good');batIndex=(batIndex+1)%9;balls=strikes=0;saveDb();updateBoard();saveGameState();maybeCpuPitchChange();if(inning===9&&userScore>cpuScore)return endGame('再見勝！');if(outs>=3)return endHalf();showIntro();schedulePitch(1150)}'''
replace_between('function completePA',"$('runHoldBtn')",new_complete)

# CPU hit camera treat DP as out, plus relay visual
cs=s.index('function showCpuHitThen')
ce=s.index('\nfunction cpuAdvance',cs)
cseg=s[cs:ce]
cseg=cseg.replace("splash.textContent=result==='OUT'?label:result==='HR'?'HOME RUN!':label", "splash.textContent=(result==='OUT'||result==='DP')?label:result==='HR'?'HOME RUN!':label")
cseg=cseg.replace("if(result==='OUT'&&fielder)", "if((result==='OUT'||result==='DP')&&fielder)")
cseg=cseg.replace("else if(result!=='OUT')sfx('hit');else sfx('out')", "else if(result!=='OUT'&&result!=='DP')sfx('hit');else sfx('out')")
# add double-play relay after fielder movement block
needle="if(shadow)shadow.animate([{left:'50%',top:'82%',opacity:.45},{left:target[0]+'%',top:(target[1]+5)+'%',opacity:.24}],{duration:dur,fill:'forwards'});"
cseg=cseg.replace(needle,needle+"if(result==='DP')gameSetTimeout(()=>{animateRelay(target[0],target[1],50,55,0,300);animateRelay(50,55,70,71,300,360);splash.textContent='雙殺守備！'},Math.min(600,dur*.55));")
s=s[:cs]+cseg+s[ce:]

# ===== tactics render + strategy controls =====
new_render_tactics=r'''function renderTactics(){const hit=availableBench('hit').slice(0,140),run=availableBench('run').slice(0,140),rel=configuredBullpen();$('pinchHitterSelect').innerHTML=hit.map(p=>`<option value="${playerId(p)}">${p.name}｜OPS ${rate(p.stats?.OPS)}｜PWR ${gameRatings(p).power}</option>`).join('')||'<option value="">無可用球員</option>';$('pinchRunnerSelect').innerHTML=run.map(p=>`<option value="${playerId(p)}">${p.name}｜SPD ${gameRatings(p).speed}</option>`).join('')||'<option value="">無可用球員</option>';$('pinchBaseSelect').innerHTML=bases.map((r,i)=>r?`<option value="${i}">${i+1}壘｜${r.player.name}</option>`:'').join('')||'<option value="">目前壘上無人</option>';$('relieverSelect').innerHTML=rel.map(p=>{const r=pitcherRatings(p),id=playerId(p);return`<option value="${id}">${staffRole(id)}｜${p.name}｜OVR ${r.overall}｜V${r.velo} C${r.control}</option>`}).join('')||'<option value="">牛棚已無可用投手</option>';const pr=userPitcher?currentPitcherRatings(userPitcher):null;$('userPitcherStatus').textContent=userPitcher?`目前：${userPitcher.player.name}（${staffRole(playerId(userPitcher.player))}）・${userPitcher.pitches}球・耐力 ${pr.stamina}｜牛棚剩 ${rel.length} 人`:'';const defenseMode=halfMode==='pitch';$('pinchHitterSelect').disabled=defenseMode;$('pinchRunnerSelect').disabled=defenseMode;$('pinchBaseSelect').disabled=defenseMode;$('pinchHitBtn').disabled=defenseMode;$('pinchRunBtn').disabled=defenseMode;$('buntCallBtn').disabled=defenseMode;$('hitRunCallBtn').disabled=defenseMode||!bases[0];$('stealCallBtn').disabled=defenseMode||(!bases[0]&&!bases[1]);$('offenseTacticBox').style.opacity=defenseMode?'.45':'1';$('offenseCallStatus').textContent='目前：'+(offenseCall==='bunt'?'短打':offenseCall==='hitrun'?'打帶跑':'正常進攻');if(defenseMode)$('tacticStatus').textContent='目前由你投球；可使用換投，牽制則直接在球種列上方操作。';}'''
replace_between('function renderTactics','function openTactics',new_render_tactics)

# tactics opening clears pending CPU pitch timer, closing resumes
new_open=r'''function openTactics(){if(!playing||paused)return;if(pitching||!$('hitCam').classList.contains('hidden')||!$('runDecisionOverlay').classList.contains('hidden')){setMsg('這球進行中','等這球結束後再使用戰術','');return}if(timer){gameClearTimeout(timer);timer=0}if(balls||strikes){setMsg('打席進行中',halfMode==='pitch'?'目前是你投球，可換投':'可調整跑壘與進攻戰術；代打仍需等新打席','')}renderTactics();$('tacticsOverlay').classList.remove('hidden')}'''
replace_between('function openTactics',"$('tacticsBtn').onclick",new_open)
rep("$('tacticsBtn').onclick=openTactics;$('closeTactics').onclick=()=>$('tacticsOverlay').classList.add('hidden');", "$('tacticsBtn').onclick=openTactics;$('closeTactics').onclick=()=>{$('tacticsOverlay').classList.add('hidden');if(halfMode==='bat'&&playing&&!paused&&!pitching)schedulePitch(500)};")

# strategy button handlers inserted before pitch change
strategy_handlers=r'''$('buntCallBtn').onclick=()=>{if(halfMode!=='bat')return;offenseCall='bunt';updateOffenseCallUi();$('tacticsOverlay').classList.add('hidden');setMsg('短打戰術','下一球進入短打模式','');saveGameState();schedulePitch(500)};
$('hitRunCallBtn').onclick=()=>{if(halfMode!=='bat'||!bases[0])return;offenseCall='hitrun';updateOffenseCallUi();$('tacticsOverlay').classList.add('hidden');setMsg('打帶跑','一壘跑者起跑，打者必須保護跑者','');saveGameState();schedulePitch(500)};
$('stealCallBtn').onclick=()=>{if(halfMode!=='bat')return;const r=attemptUserSteal(false);$('tacticsOverlay').classList.add('hidden');offenseCall='normal';updateOffenseCallUi();if(!r.ended&&playing)schedulePitch(650)};
'''
rep("$('pitchChangeBtn').onclick=", strategy_handlers+"$('pitchChangeBtn').onclick=",1)

# chart buttons + resume event + visibility saving
rep("$('pauseBtn').onclick=()=>setGamePaused(true);$('resumeBtn').onclick=()=>setGamePaused(false);document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)setGamePaused(true)});", "$('pauseBtn').onclick=()=>setGamePaused(true);$('resumeBtn').onclick=()=>setGamePaused(false);$('pitchChartBtn').onclick=()=>{renderPitchChart();$('pitchChartOverlay').classList.remove('hidden')};$('closePitchChart').onclick=()=>$('pitchChartOverlay').classList.add('hidden');$('resumeGameBtn').onclick=resumeSavedGame;document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){saveGameState();if(!paused)setGamePaused(true)}});")

# start new game clears previous live snapshot
rep("function startGame(){clearAllGameTimers();resetPauseUi();", "function startGame(){clearGameSave();clearAllGameTimers();resetPauseUi();")

# game end clears live snapshot
rep("function endGame(title){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();", "function endGame(title){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();clearGameSave();")

# end half save flows via start halves; return to setup intentionally clears snapshot
rep("function returnToSetup(){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();", "function returnToSetup(){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();clearGameSave();")

# CPU pitcher also benefits from pitch mastery quality
old_throw_start=s.index('function throwPitch()')
old_throw_end=s.index('\nfunction pitchEnd',old_throw_start)
throw=s[old_throw_start:old_throw_end]
throw=throw.replace("code=choosePitch(pr),pt=basePitchTypes[code];", "code=choosePitch(pr),pt=basePitchTypes[code],m=pitchMastery(cpuPitcher.player,code);")
throw=throw.replace("lastSpeed=Math.round(fast+pt.delta+rand(-2.2,2.2));", "lastSpeed=Math.round(fast+pt.delta+rand(-2.2,2.2)+((code==='FF'||code==='SI')?(m.score-72)*.022:0));")
throw=throw.replace("const zoneProb=clamp(.49+pr.control*.0038-fat*.14,.55,.86)", "const zoneProb=clamp(.49+pr.control*.0038+(m.score-70)*.0012-fat*.14,.55,.89)")
throw=throw.replace("const breakScale=.65+pr.break/100;", "const breakScale=(.65+pr.break/100)*(.84+m.score/320);")
s=s[:old_throw_start]+throw+s[old_throw_end:]

# version bump
v=Path('site-version.js')
vs=v.read_text()
import re
vs=re.sub(r"const SITE_VERSION = 'v[^']+';", "const SITE_VERSION = 'v1.13.0';", vs, count=1)
v.write_text(vs)

p.write_text(s)
print('V13 full strategy upgrade patched')
