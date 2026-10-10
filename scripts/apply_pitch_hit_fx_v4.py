from pathlib import Path

path = Path('pitching-app/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    text = text.replace(old, new, 1)

# Stronger batter swing and new hit / strikeout effects.
replace_once(
    ".batter.swing{animation:batterSwing .36s ease-out}\n    @keyframes batterSwing{0%{transform:rotate(0) translateX(0)}45%{transform:rotate(-15deg) translateX(-6px)}100%{transform:rotate(0) translateX(0)}}",
    ".batter.swing{animation:batterSwing .42s cubic-bezier(.2,.8,.2,1)}\n    @keyframes batterSwing{0%{transform:rotate(0) translateX(0)}34%{transform:rotate(-26deg) translateX(-11px) translateY(1px)}62%{transform:rotate(-10deg) translateX(-5px)}100%{transform:rotate(0) translateX(0)}}",
    'batter swing css'
)
replace_once(
    ".toast.show{opacity:1;transform:translateX(-50%) scale(1)}",
    ".toast.show{opacity:1;transform:translateX(-50%) scale(1)}\n    .battedBall{display:none;position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.38),0 0 12px rgba(255,255,255,.8);z-index:24;pointer-events:none}\n    .battedBall:before,.battedBall:after{content:\"\";position:absolute;top:2px;width:3px;height:9px;border:1px solid #d34a4a;border-top-color:transparent;border-bottom-color:transparent;border-radius:50%}.battedBall:before{left:2px}.battedBall:after{right:2px}\n    .impactFlash{position:absolute;inset:0;opacity:0;pointer-events:none;z-index:21;background:radial-gradient(circle at 58% 48%,rgba(255,255,255,.95) 0 2%,rgba(255,215,90,.46) 3% 10%,transparent 28%)}\n    .impactFlash.show{animation:impactFlash .32s ease-out}.impactFlash.homer{background:radial-gradient(circle at 58% 48%,rgba(255,255,255,1) 0 2%,rgba(255,130,50,.62) 3% 12%,transparent 34%)}\n    @keyframes impactFlash{0%{opacity:0}20%{opacity:1}100%{opacity:0}}\n    .bigFx{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%) scale(.72);opacity:0;z-index:26;pointer-events:none;white-space:nowrap;font-size:30px;font-weight:1000;letter-spacing:.04em;text-shadow:0 4px 14px rgba(0,0,0,.65)}\n    .bigFx.show{animation:bigFxPop .9s cubic-bezier(.18,.85,.2,1)}.bigFx.strikeout{color:#9ce9ff}.bigFx.homer{color:#ffd76a;font-size:34px}.bigFx.hit{color:#9df5b9}.bigFx.foul{color:#fff}\n    @keyframes bigFxPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.55)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-58%) scale(1.03)}}\n    .stage.fxShake{animation:stageShake .28s ease-out}@keyframes stageShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}}",
    'fx css'
)

replace_once(
    '<div class="trail" id="trail"></div><div class="ballFlight" id="ballFlight"></div>',
    '<div class="trail" id="trail"></div><div class="ballFlight" id="ballFlight"></div><div class="battedBall" id="battedBall"></div><div class="impactFlash" id="impactFlash"></div><div class="bigFx" id="bigFx"></div>',
    'fx html'
)

replace_once("state.duel=Object.assign({ks:0,bb:0,hits:0,pa:0},state.duel||{});", "state.duel=Object.assign({ks:0,bb:0,hits:0,hr:0,pa:0},state.duel||{});", 'duel hr state')
replace_once("let aiming=false, aimPointer=null, gameMode='duel', balls=0, strikesCount=0, paLocked=false, recentPitchIds=[];", "let aiming=false, aimPointer=null, gameMode='duel', balls=0, strikesCount=0, paLocked=false, recentPitchIds=[], fxBusy=false;", 'fx busy state')
replace_once(
    "const resultMain=$('#resultMain'), resultSub=$('#resultSub'), velo=$('#velo'), throwBtn=$('#throwBtn');",
    "const resultMain=$('#resultMain'), resultSub=$('#resultSub'), velo=$('#velo'), throwBtn=$('#throwBtn'), battedBall=$('#battedBall'), impactFlash=$('#impactFlash'), bigFx=$('#bigFx');",
    'fx dom refs'
)
replace_once("$('#duelRecord').textContent=`K ${state.duel.ks} · BB ${state.duel.bb} · H ${state.duel.hits}`;", "$('#duelRecord').textContent=`K ${state.duel.ks} · BB ${state.duel.bb} · H ${state.duel.hits} · HR ${state.duel.hr}`;", 'duel hud hr')

replace_once(
    "function swingBatter(){const b=$('.batter');b.classList.remove('swing');void b.offsetWidth;b.classList.add('swing');setTimeout(()=>b.classList.remove('swing'),420)}",
    """function buzz(pattern){try{if(navigator.vibrate)navigator.vibrate(pattern)}catch(e){}}
function impact(kind='hit'){
  impactFlash.className='impactFlash';
  stage.classList.remove('fxShake');
  void impactFlash.offsetWidth;
  impactFlash.classList.add('show');
  if(kind==='homer')impactFlash.classList.add('homer');
  void stage.offsetWidth;stage.classList.add('fxShake');
  setTimeout(()=>stage.classList.remove('fxShake'),320);
}
function showBigFx(text,kind=''){
  bigFx.textContent=text;bigFx.className='bigFx';void bigFx.offsetWidth;
  bigFx.classList.add('show');if(kind)bigFx.classList.add(kind);
}
function animateBattedBall(kind,actual){
  fxBusy=true;throwBtn.disabled=true;
  const rect=stage.getBoundingClientRect(),start=targetPixel(actual.x,actual.y),side=Math.random()<.5?-1:1;
  let end={x:rect.width*.5,y:rect.height*.32},ctrl={x:rect.width*.5,y:rect.height*.12},dur=720;
  if(kind==='foul'){end={x:side<0?-28:rect.width+28,y:rect.height*(.34+Math.random()*.20)};ctrl={x:rect.width*(side<0?.18:.82),y:rect.height*.16};dur=560}
  else if(kind==='ground'){end={x:rect.width*(.36+Math.random()*.28),y:rect.height*.57};ctrl={x:rect.width*.5,y:rect.height*.47};dur=520}
  else if(kind==='out'){end={x:rect.width*(.28+Math.random()*.44),y:rect.height*(.24+Math.random()*.13)};ctrl={x:rect.width*(.34+Math.random()*.32),y:rect.height*.07};dur=720}
  else if(kind==='double'){end={x:rect.width*(.20+Math.random()*.60),y:rect.height*.14};ctrl={x:rect.width*(.26+Math.random()*.48),y:-12};dur=820}
  else if(kind==='homer'){end={x:rect.width*(.12+Math.random()*.76),y:-38};ctrl={x:rect.width*(.20+Math.random()*.60),y:-70};dur=980}
  else{end={x:rect.width*(.24+Math.random()*.52),y:rect.height*.29};ctrl={x:rect.width*(.30+Math.random()*.40),y:rect.height*.03};dur=700}
  battedBall.style.display='block';battedBall.style.left=(start.x-6.5)+'px';battedBall.style.top=(start.y-6.5)+'px';battedBall.style.transform='scale(1)';
  impact(kind);const t0=performance.now();
  function frame(now){
    const t=clamp((now-t0)/dur,0,1),q=1-t;
    const x=q*q*start.x+2*q*t*ctrl.x+t*t*end.x,y=q*q*start.y+2*q*t*ctrl.y+t*t*end.y;
    const scale=kind==='homer'?1-t*.58:1-t*.38;
    battedBall.style.left=(x-6.5)+'px';battedBall.style.top=(y-6.5)+'px';battedBall.style.transform=`scale(${Math.max(.34,scale)}) rotate(${t*720}deg)`;
    if(t<1)requestAnimationFrame(frame);else{setTimeout(()=>{battedBall.style.display='none';fxBusy=false;if(!throwing&&!paLocked)throwBtn.disabled=false;},80)}
  }
  requestAnimationFrame(frame);
}
function swingBatter(){const b=$('.batter');b.classList.remove('swing');void b.offsetWidth;b.classList.add('swing');setTimeout(()=>b.classList.remove('swing'),460)}""",
    'fx functions'
)

replace_once(
    "setTimeout(()=>{newBatter();paLocked=false;throwing=false;throwBtn.disabled=false;resultMain.textContent='下一位打者';resultSub.textContent='重新配球，試著製造三振';},900);",
    "setTimeout(()=>{newBatter();paLocked=false;throwing=false;throwBtn.disabled=fxBusy;resultMain.textContent='下一位打者';resultSub.textContent='重新配球，試著製造三振';},1050);",
    'plate appearance unlock'
)

replace_once(
    "if(Math.random()>contactProb){strikesCount++;resultMain.textContent='揮棒落空！';resultSub.textContent=`${selected.name} 騙到打者`;showToast('SWING & MISS','good')}",
    "if(Math.random()>contactProb){strikesCount++;resultMain.textContent='揮棒落空！';resultSub.textContent=`${selected.name} 騙到打者`;showToast('SWING & MISS','good');buzz(22)}",
    'swing miss buzz'
)
replace_once(
    "if(poor||Math.random()<.38){if(strikesCount<2)strikesCount++;resultMain.textContent='界外球';resultSub.textContent='打者碰到球，但沒有打好';showToast('FOUL')}",
    "if(poor||Math.random()<.38){if(strikesCount<2)strikesCount++;resultMain.textContent='界外球';resultSub.textContent='打者碰到球，但沒有打好';showToast('FOUL');showBigFx('FOUL','foul');animateBattedBall('foul',actual);buzz(18)}",
    'foul animation'
)
replace_once(
    """if(Math.random()<hitChance){state.duel.hits++;const extra=Math.random()<currentBatter.power*.22;endPlateAppearance(extra?'長打！':'安打',`${currentBatter.name} 把 ${selected.name} 打進場內`,'bad');return true}
        endPlateAppearance('打者出局','球被打進場內但形成出局','good');return true""",
    """if(Math.random()<hitChance){
          state.duel.hits++;
          const centerDist=Math.hypot(actual.x-.5,actual.y-.5);
          const hrChance=clamp(.015+Math.max(0,currentBatter.power-.42)*.20+(centerDist<.42?.035:0)+(speed>145?.018:0),.01,.17);
          if(Math.random()<hrChance){
            state.duel.hr++;showBigFx('HOME RUN!','homer');animateBattedBall('homer',actual);buzz([35,30,70,35,110]);
            endPlateAppearance('全壘打！',`${currentBatter.name} 把 ${selected.name} 轟出牆`,'bad');return true;
          }
          const extra=Math.random()<currentBatter.power*.24;
          showBigFx(extra?'EXTRA BASE!':'BASE HIT','hit');animateBattedBall(extra?'double':'hit',actual);buzz(34);
          endPlateAppearance(extra?'長打！':'安打',`${currentBatter.name} 把 ${selected.name} 打進場內`,'bad');return true;
        }
        animateBattedBall(Math.random()<.45?'ground':'out',actual);buzz(16);
        endPlateAppearance('打者出局','球被打進場內但形成出局','good');return true""",
    'contact outcome animations'
)
replace_once(
    "if(strikesCount>=3){state.duel.ks++;endPlateAppearance('三振！',`${selected.name} 解決 ${currentBatter.name}`,'good');return true}",
    "if(strikesCount>=3){state.duel.ks++;showBigFx('STRIKE OUT!','strikeout');impact('strikeout');buzz([55,35,95]);endPlateAppearance('三振！',`${selected.name} 解決 ${currentBatter.name}`,'good');return true}",
    'strikeout fx'
)
replace_once("if(throwing||paLocked)return;throwing=true;throwBtn.disabled=true;", "if(throwing||paLocked||fxBusy)return;throwing=true;throwBtn.disabled=true;", 'pitch fx lock')
replace_once("save();updateStats();throwing=false;throwBtn.disabled=false;", "save();updateStats();throwing=false;throwBtn.disabled=fxBusy;", 'pitch fx unlock')

replace_once(
    '<div class="statBox"><b>${state.duel.hits}</b><span>被敲安打</span></div><div class="statBox"><b>${state.duel.pa}</b><span>完成打席</span></div>',
    '<div class="statBox"><b>${state.duel.hits}</b><span>被敲安打</span></div><div class="statBox"><b>${state.duel.hr}</b><span>被轟全壘打</span></div><div class="statBox"><b>${state.duel.pa}</b><span>完成打席</span></div>',
    'stats hr'
)
replace_once(
    '三振、四壞、安打與出局都會記錄；如果一直重複同一球種，打者會更容易抓到。',
    '三振、四壞、安打、全壘打與出局都會記錄；打中球時會看到球飛往場內、界外或飛出牆。如果一直重複同一球種，打者會更容易抓到。',
    'help hit fx'
)
replace_once(
    "state={total:0,strikes:0,veloSum:0,best:0,history:[],duel:{ks:0,bb:0,hits:0,pa:0}};",
    "state={total:0,strikes:0,veloSum:0,best:0,history:[],duel:{ks:0,bb:0,hits:0,hr:0,pa:0}};",
    'reset hr'
)

path.write_text(text, encoding='utf-8')

sw = Path('pitching-app/sw.js')
sw_text = sw.read_text(encoding='utf-8')
if "const CACHE='pitch-king-v3';" in sw_text:
    sw_text = sw_text.replace("const CACHE='pitch-king-v3';", "const CACHE='pitch-king-v4';", 1)
elif "const CACHE='pitch-king-v4';" not in sw_text:
    raise SystemExit('unexpected service worker cache version')
sw.write_text(sw_text, encoding='utf-8')

update = Path('pitching-app/update.html')
update_text = update.read_text(encoding='utf-8')
update_text = update_text.replace("./?v=3&fresh=", "./?v=4&fresh=")
update.write_text(update_text, encoding='utf-8')

Path('pitching-app/version.txt').write_text('Pitch King v4 - batted ball flight, HR and strikeout FX\n', encoding='utf-8')
print('patched Pitch King v4 hit flight + strikeout FX')
