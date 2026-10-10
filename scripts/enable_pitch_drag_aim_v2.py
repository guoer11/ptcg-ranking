from pathlib import Path

path = Path('pitching-app/index.html')
text = path.read_text(encoding='utf-8')


def rep(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing: {label}')
    text = text.replace(old, new, 1)
    print('ok:', label)

rep(
    ".stage{position:relative;height:min(52vh,455px);min-height:355px;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 45px rgba(0,0,0,.32);background:",
    ".stage{position:relative;height:min(52vh,455px);min-height:355px;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 45px rgba(0,0,0,.32);touch-action:none;user-select:none;-webkit-user-select:none;background:",
    'stage drag css'
)
rep(
    ".strikeZone{width:100%;height:100%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.25),0 0 24px rgba(255,255,255,.08)}",
    ".strikeZone{width:100%;height:100%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.25),0 0 24px rgba(255,255,255,.08);pointer-events:none}",
    'strikezone pointer css'
)
rep(
    ".cell{border:1px solid rgba(255,255,255,.32);background:rgba(4,13,22,.12);position:relative}",
    ".cell{border:1px solid rgba(255,255,255,.32);background:rgba(4,13,22,.12);position:relative;pointer-events:none}",
    'cell pointer css'
)
rep(
    ".aim{position:absolute;width:28px;height:28px;border:2px solid #8ce2ff;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 5px rgba(74,179,255,.13),0 0 18px rgba(74,179,255,.45)}",
    ".aim{position:absolute;width:30px;height:30px;border:2px solid #8ce2ff;border-radius:50%;left:50%;top:48%;transform:translate(-50%,-50%);pointer-events:none;z-index:12;box-shadow:0 0 0 6px rgba(74,179,255,.13),0 0 18px rgba(74,179,255,.55)}",
    'aim css'
)
rep(
    '      <div class="strikeZone" id="strikeZone"></div>\n      <div class="aim" id="aim"></div>\n    </div>',
    '      <div class="strikeZone" id="strikeZone"></div>\n    </div>\n    <div class="aim" id="aim"></div>',
    'aim stage placement'
)
rep(
    '<div><div class="resultMain" id="resultMain">點選九宮格瞄準</div><div class="resultSub" id="resultSub">選球種後按「投球」</div></div>',
    '<div><div class="resultMain" id="resultMain">拖曳準星瞄準</div><div class="resultSub" id="resultSub">可滑到好球帶內外任意位置</div></div>',
    'initial copy'
)
rep(
    "let selected = pitches[0], targetCell = 4, throwing=false, challenge=false, challengeRound=0, challengePoints=0, challengeTarget=4;",
    "let selected = pitches[0], target={x:.5,y:.5}, throwing=false, challenge=false, challengeRound=0, challengePoints=0, challengeTarget=4;\nlet aiming=false, aimPointer=null;",
    'continuous target state'
)
rep(
"""function cellCenter(i){return {x:(i%3+.5)/3,y:(Math.floor(i/3)+.5)/3}}
function updateAim(){
  const c=cellCenter(targetCell); aim.style.left=(c.x*100)+'%'; aim.style.top=(c.y*100)+'%';
  document.querySelectorAll('.cell').forEach((el,i)=>el.classList.toggle('active',i===targetCell));
}
function renderZone(){
  zone.innerHTML='';
  for(let i=0;i<9;i++){let c=document.createElement('button');c.className='cell';c.dataset.i=i;c.setAttribute('aria-label','瞄準第'+(i+1)+'格');c.onclick=()=>{if(!throwing){targetCell=i;updateAim();}};zone.appendChild(c)}
  updateChallengeMarker(); updateAim();
}
""",
"""function cellCenter(i){return {x:(i%3+.5)/3,y:(Math.floor(i/3)+.5)/3}}
function updateAim(){
  const p=targetPixel(target.x,target.y);
  aim.style.left=p.x+'px';
  aim.style.top=p.y+'px';
}
function renderZone(){
  zone.innerHTML='';
  for(let i=0;i<9;i++){
    const c=document.createElement('div');
    c.className='cell';
    c.dataset.i=i;
    zone.appendChild(c);
  }
  updateChallengeMarker(); updateAim();
}
""",
    'continuous aim rendering'
)
rep(
"""function updateChallengeMarker(){
  document.querySelectorAll('.cell').forEach((el,i)=>el.classList.toggle('challenge',challenge&&i===challengeTarget));
}
function renderPitches(){
""",
"""function updateChallengeMarker(){
  document.querySelectorAll('.cell').forEach((el,i)=>el.classList.toggle('challenge',challenge&&i===challengeTarget));
}
function setTargetFromPointer(e){
  const s=stage.getBoundingClientRect();
  const z=$('#strikeWrap').getBoundingClientRect();
  const resultRect=$('.resultCard').getBoundingClientRect();
  const x=clamp(e.clientX,s.left+15,s.right-15);
  const y=clamp(e.clientY,s.top+18,Math.min(s.bottom-86,resultRect.top-8));
  target.x=(x-z.left)/z.width;
  target.y=(y-z.top)/z.height;
  updateAim();
  resultMain.textContent=challenge?'拖曳準星對準黃色目標':'拖曳準星瞄準';
  resultSub.textContent=challenge?'放開後按「挑戰投球」':'可投好球帶內外任意位置';
}
function beginAim(e){
  if(throwing || (typeof e.button==='number' && e.button>0))return;
  if(e.target.closest && e.target.closest('.resultCard'))return;
  aiming=true;aimPointer=e.pointerId;
  if(stage.setPointerCapture)stage.setPointerCapture(e.pointerId);
  setTargetFromPointer(e);
  e.preventDefault();
}
function moveAim(e){
  if(!aiming || e.pointerId!==aimPointer || throwing)return;
  setTargetFromPointer(e);
  e.preventDefault();
}
function endAim(e){
  if(e.pointerId!==aimPointer)return;
  aiming=false;aimPointer=null;
  if(stage.releasePointerCapture && stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
}
stage.addEventListener('pointerdown',beginAim);
stage.addEventListener('pointermove',moveAim);
stage.addEventListener('pointerup',endAim);
stage.addEventListener('pointercancel',endAim);
function renderPitches(){
""",
    'pointer drag handlers'
)
rep(
"""function actualPitch(){
  const c=cellCenter(targetCell);
  const spread=(1-selected.control)*.68 + .055;
  let x=c.x+randn()*spread*.33, y=c.y+randn()*spread*.42;
  x+=selected.breakX/520; y+=selected.breakY/580;
  return {x,y};
}
""",
"""function actualPitch(){
  const spread=(1-selected.control)*.68 + .055;
  let x=target.x+randn()*spread*.33, y=target.y+randn()*spread*.42;
  x+=selected.breakX/520; y+=selected.breakY/580;
  return {x,y};
}
""",
    'pitch from continuous target'
)
rep(
"""function classify(actual){
  const inside=actual.x>=0&&actual.x<=1&&actual.y>=0&&actual.y<=1;
  const tc=cellCenter(targetCell), dist=Math.hypot(actual.x-tc.x,actual.y-tc.y);
""",
"""function classify(actual){
  const inside=actual.x>=0&&actual.x<=1&&actual.y>=0&&actual.y<=1;
  const dist=Math.hypot(actual.x-target.x,actual.y-target.y);
""",
    'continuous accuracy distance'
)
rep(
"""      const hit=(targetCell===challengeTarget && r.dist<.19);
      const pts=hit?Math.max(50,Math.round(100-r.dist*260)):Math.max(0,Math.round(35-r.dist*80));
""",
"""      const goal=cellCenter(challengeTarget);
      const goalDist=Math.hypot(actual.x-goal.x,actual.y-goal.y);
      const hit=goalDist<.19;
      const pts=hit?Math.max(50,Math.round(100-goalDist*260)):Math.max(0,Math.round(35-goalDist*80));
""",
    'challenge continuous scoring'
)
rep(
    "        do{challengeTarget=Math.floor(Math.random()*9)}while(challengeTarget===targetCell&&Math.random()<.5);",
    "        const previous=challengeTarget;do{challengeTarget=Math.floor(Math.random()*9)}while(challengeTarget===previous);",
    'challenge next target'
)
rep(
    "  resultMain.textContent=challenge?'瞄準黃色目標':'點選九宮格瞄準';\n  resultSub.textContent=challenge?'10 球，越接近目標分數越高':'選球種後按「投球」';",
    "  resultMain.textContent=challenge?'拖曳準星對準黃色目標':'拖曳準星瞄準';\n  resultSub.textContent=challenge?'10 球，可滑動微調到任意位置':'可投好球帶內外任意位置';",
    'mode copy'
)

old_help='先選球種，再點九宮格決定想投的位置，按「投球」即可。目前收錄 45 種球路'
new_help='先選球種，直接在球場上按住並拖曳藍色準星，可瞄準好球帶內或外側任意位置，放開後按「投球」。目前收錄 45 種球路'
rep(old_help,new_help,'help copy')

path.write_text(text,encoding='utf-8')

sw=Path('pitching-app/sw.js')
sw_text=sw.read_text(encoding='utf-8')
if "const CACHE='pitch-king-v1';" in sw_text:
    sw_text=sw_text.replace("const CACHE='pitch-king-v1';","const CACHE='pitch-king-v2';",1)
elif "const CACHE='pitch-king-v2';" not in sw_text:
    raise SystemExit('unexpected cache version')
sw.write_text(sw_text,encoding='utf-8')
Path('pitching-app/version.txt').write_text('Pitch King v2.1 - free drag aiming\n',encoding='utf-8')
print('done')
