from pathlib import Path
import re

p=Path('baseball-game.html')
s=p.read_text()

if 'V144_HALF_INNING_BREAK' in s:
    raise SystemExit('v1.14.4 half-inning break already installed')
if 'V141_INTERPLAY_REST' not in s:
    raise SystemExit('old five-second rest block not found')

# Remove the prior per-pitch / per-play five-second rest feature.
pattern=r"\n// ===== V141_INTERPLAY_REST =====.*?(?=\n\}\)\(\);)"
s2,n=re.subn(pattern,'',s,flags=re.S)
if n!=1:
    raise SystemExit(f'expected one old rest block, found {n}')
s=s2

block=r'''
// ===== V144_HALF_INNING_BREAK =====
let v144HalfBreakToken=0,v144HalfBreakActive=false;
function v144EnsureHalfBreakUi(){
  let el=$('v144HalfBreakChip');
  if(el)return el;
  const st=document.createElement('style');
  st.textContent=`#v144HalfBreakChip{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:138;pointer-events:none;background:rgba(5,20,22,.94);border:1px solid #6b817e;color:#fff;border-radius:999px;padding:9px 15px;font-weight:950;font-size:13px;box-shadow:0 8px 24px #0008;backdrop-filter:blur(8px)}#v144HalfBreakChip b{color:#ffe071;font-size:18px;margin:0 3px}#v144HalfBreakChip.hidden{display:none!important}@media(max-width:620px){#v144HalfBreakChip{top:68px;font-size:12px;padding:8px 13px}}`;
  document.head.appendChild(st);
  el=document.createElement('div');
  el.id='v144HalfBreakChip';
  el.className='hidden';
  document.body.appendChild(el);
  return el;
}
function v144BeginHalfBreak(onFinish){
  const token=++v144HalfBreakToken,el=v144EnsureHalfBreakUi();
  v144HalfBreakActive=true;
  if($('swingBtn'))$('swingBtn').disabled=true;
  if($('userPitchBtn'))$('userPitchBtn').disabled=true;
  if($('tacticsBtn'))$('tacticsBtn').disabled=true;
  let remain=5;
  const tick=()=>{
    if(token!==v144HalfBreakToken)return;
    el.classList.remove('hidden');
    el.innerHTML=`攻守交換 <b>${remain}</b> 秒`;
    if($('pitchInfo'))$('pitchInfo').textContent=`攻守交換・${remain} 秒`;
    if(remain<=1){
      gameSetTimeout(()=>{
        if(token!==v144HalfBreakToken)return;
        v144HalfBreakActive=false;
        el.classList.add('hidden');
        if(typeof onFinish==='function')onFinish();
      },1000);
      return;
    }
    remain--;
    gameSetTimeout(tick,1000);
  };
  tick();
}
const v144EndHalfBase=endHalf;
endHalf=function(...args){
  if(v144HalfBreakActive)return;
  const gameEndsNow=(halfMode==='pitch'&&inning===9&&userScore>cpuScore)||(halfMode==='bat'&&inning>=9);
  if(gameEndsNow)return v144EndHalfBase(...args);
  clearMotion();
  setMsg('三出局','攻守交換，5 秒後繼續','');
  updateBoard();
  saveGameState();
  v144BeginHalfBreak(()=>{
    if(!playing)return;
    v144EndHalfBase(...args);
  });
};
'''
idx=s.rfind('\n})();')
if idx<0:
    raise SystemExit('IIFE close not found')
s=s[:idx]+"\n"+block+s[idx:]
p.write_text(s)

vp=Path('site-version.js')
v=vp.read_text()
m=re.search(r"const SITE_VERSION = 'v(\d+)\.(\d+)\.(\d+)'",v)
if not m:
    raise SystemExit('site version not found')
major,minor,patch=map(int,m.groups())
new=f"const SITE_VERSION = 'v{major}.{minor}.{patch+1}'"
v=v[:m.start()]+new+v[m.end():]
vp.write_text(v)
