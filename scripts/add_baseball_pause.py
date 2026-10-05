from pathlib import Path

p = Path('baseball-game.html')
s = p.read_text()

if 'id="pauseBtn"' in s:
    raise SystemExit('pause control already present')

# Make every in-game delayed event pausable. Do this before inserting wrapper code.
s = s.replace('setTimeout(', 'gameSetTimeout(').replace('clearTimeout(', 'gameClearTimeout(')

# Bottom controls: menu / pause / tactics / context action.
s = s.replace(
    '.controls{grid-template-columns:.62fr .72fr 1.25fr}.control.strategy{background:#244e54;color:#fff}',
    '.controls{grid-template-columns:.55fr .55fr .68fr 1.22fr;gap:7px}.control.strategy{background:#244e54;color:#fff}#pauseBtn{background:#d9eaff;color:#173651}.game.paused .scene,.game.paused .pitch-mode-panel{filter:brightness(.68) saturate(.72)}.game.paused .pitcher,.game.paused .batter,.game.paused .bat,.game.paused .intro,.game.paused .catchFlash{animation-play-state:paused!important}.pause-modal{text-align:center;max-width:420px}.pause-icon{font-size:52px;line-height:1;margin-bottom:8px}.pause-modal .primary{width:100%;margin-top:14px;font-size:18px}'
)

old_footer = '<footer class="controls"><button id="menuBtn" class="control">結束／選單</button><button id="tacticsBtn" class="control strategy">戰術</button><button id="swingBtn" class="control" disabled>揮棒！</button><button id="userPitchBtn" class="control pitch-action hidden">投球！</button></footer>'
new_footer = '<footer class="controls"><button id="menuBtn" class="control">結束／選單</button><button id="pauseBtn" class="control">暫停</button><button id="tacticsBtn" class="control strategy">戰術</button><button id="swingBtn" class="control" disabled>揮棒！</button><button id="userPitchBtn" class="control pitch-action hidden">投球！</button></footer>'
if old_footer not in s:
    raise SystemExit('footer target not found')
s = s.replace(old_footer, new_footer)

pause_overlay = '<div id="pauseOverlay" class="overlay hidden"><div class="modal pause-modal"><div class="pause-icon">⏸️</div><h2>比賽暫停</h2><p class="sub">投球、動畫與比賽計時都已停止。準備好後再繼續。</p><button id="resumeBtn" class="primary">▶ 繼續比賽</button></div></div>\n'
marker = '<div id="tacticsOverlay" class="overlay hidden">'
if marker not in s:
    raise SystemExit('overlay marker not found')
s = s.replace(marker, pause_overlay + marker, 1)

# Install a pausable timer layer immediately after the DOM helper definitions.
anchor = "const $=id=>document.getElementById(id),qsa=s=>[...document.querySelectorAll(s)];\n"
wrapper = r'''const nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
let gameTimerSeq=1,gameTimers=new Map();
function armGameTimer(id,rec){rec.started=performance.now();rec.native=nativeSetTimeout(()=>{rec.native=0;if(paused){rec.remaining=Math.max(0,rec.remaining-(performance.now()-rec.started));return}gameTimers.delete(id);rec.fn(...rec.args)},Math.max(0,rec.remaining))}
function gameSetTimeout(fn,delay=0,...args){const id=gameTimerSeq++,rec={fn,args,remaining:Number(delay)||0,started:0,native:0};gameTimers.set(id,rec);if(!paused)armGameTimer(id,rec);return id}
function gameClearTimeout(id){const rec=gameTimers.get(id);if(!rec)return;if(rec.native)nativeClearTimeout(rec.native);gameTimers.delete(id)}
function pauseGameTimers(){const now=performance.now();for(const rec of gameTimers.values()){if(rec.native){nativeClearTimeout(rec.native);rec.native=0;rec.remaining=Math.max(0,rec.remaining-(now-rec.started))}}}
function resumeGameTimers(){for(const[id,rec]of gameTimers){if(!rec.native)armGameTimer(id,rec)}}
function clearAllGameTimers(){for(const rec of gameTimers.values())if(rec.native)nativeClearTimeout(rec.native);gameTimers.clear()}
'''
if anchor not in s:
    raise SystemExit('JS anchor not found')
s = s.replace(anchor, anchor + wrapper, 1)

# Pause state variables.
s = s.replace('let audioCtx=null;\n', 'let audioCtx=null;\nlet paused=false,pauseStarted=0,pausedAnimations=[];\n', 1)

# Pause/resume logic. Web Animations and RAF are frozen in addition to all timeouts.
clear_anchor = "function clearMotion(){if(raf)cancelAnimationFrame(raf);if(timer)gameClearTimeout(timer);raf=timer=0;pitching=false;$('ball').style.display='none';if($('ballShadow'))$('ballShadow').style.display='none';$('tacticsBtn').disabled=false}\n"
if clear_anchor not in s:
    raise SystemExit('clearMotion target not found')
pause_code = r'''function gameOwnedAnimations(){const root=$('gameApp');return document.getAnimations().filter(a=>{const t=a.effect&&a.effect.target;return t&&root&&root.contains(t)})}
function resetPauseUi(){paused=false;pauseStarted=0;pausedAnimations=[];$('gameApp')?.classList.remove('paused');$('pauseOverlay')?.classList.add('hidden');if($('pauseBtn'))$('pauseBtn').textContent='暫停'}
function setGamePaused(next){if(!playing||next===paused)return;if(next){paused=true;pauseStarted=performance.now();pauseGameTimers();if(raf){cancelAnimationFrame(raf);raf=0}pausedAnimations=gameOwnedAnimations().filter(a=>a.playState==='running');pausedAnimations.forEach(a=>{try{a.pause()}catch(e){}});$('gameApp').classList.add('paused');$('pauseOverlay').classList.remove('hidden');$('pauseBtn').textContent='已暫停'}else{const gap=performance.now()-pauseStarted;if(pitching&&pitchStart>0)pitchStart+=gap;paused=false;$('gameApp').classList.remove('paused');$('pauseOverlay').classList.add('hidden');$('pauseBtn').textContent='暫停';pausedAnimations.forEach(a=>{try{if(a.playState==='paused')a.play()}catch(e){}});pausedAnimations=[];resumeGameTimers();if(pitching&&pitchStart>0&&!raf)raf=requestAnimationFrame(animatePitch)}}
'''
s = s.replace(clear_anchor, pause_code + clear_anchor, 1)

# Start each game in a clean, unpaused state.
s = s.replace(
    "function startGame(){initAudio();$('setupApp').classList.add('hidden');",
    "function startGame(){clearAllGameTimers();resetPauseUi();initAudio();$('setupApp').classList.add('hidden');",
    1
)

# Block gameplay actions while paused and keep pitch animation frozen.
s = s.replace("function userThrowPitch(){if(!playing||halfMode!=='pitch'||pitching||!userPitcher)return;", "function userThrowPitch(){if(paused||!playing||halfMode!=='pitch'||pitching||!userPitcher)return;", 1)
s = s.replace("function schedulePitch(delay=760){if(!playing||halfMode!=='bat'||outs>=3)return;", "function schedulePitch(delay=760){if(paused||!playing||halfMode!=='bat'||outs>=3)return;", 1)
s = s.replace("function throwPitch(){if(!playing||halfMode!=='bat')return;", "function throwPitch(){if(paused||!playing||halfMode!=='bat')return;", 1)
s = s.replace("function animatePitch(now){if(!pitching)return;", "function animatePitch(now){if(paused||!pitching)return;", 1)
s = s.replace("function swing(){if(halfMode!=='bat'||!playing||!pitching)return;", "function swing(){if(paused||halfMode!=='bat'||!playing||!pitching)return;", 1)
s = s.replace("function openTactics(){if(!playing)return;", "function openTactics(){if(!playing||paused)return;", 1)

# End/leave paths must clear paused timers and overlay state.
s = s.replace("function endGame(title){playing=false;clearMotion();", "function endGame(title){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();", 1)
s = s.replace("function returnToSetup(){playing=false;clearMotion();", "function returnToSetup(){playing=false;clearMotion();clearAllGameTimers();resetPauseUi();", 1)

# Pause controls + auto-pause on app switch / lock screen / phone interruption.
menu_anchor = "$('menuBtn').onclick=()=>{if(confirm('要結束這場比賽並回選人畫面嗎？'))returnToSetup()};"
if menu_anchor not in s:
    raise SystemExit('menu event target not found')
pause_events = "$('pauseBtn').onclick=()=>setGamePaused(true);$('resumeBtn').onclick=()=>setGamePaused(false);document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)setGamePaused(true)});\n"
s = s.replace(menu_anchor, pause_events + menu_anchor, 1)

p.write_text(s)

# Bump site version without touching unrelated UI.
v = Path('site-version.js')
vs = v.read_text()
vs = vs.replace("const SITE_VERSION = 'v1.12.0';", "const SITE_VERSION = 'v1.12.1';")
v.write_text(vs)
