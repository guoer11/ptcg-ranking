from pathlib import Path
import re

p=Path('baseball-game.html')
s=p.read_text()
if 'V141_INTERPLAY_REST' in s:
    raise SystemExit('five-second rest already installed')
if 'V14 COMPLETE BASEBALL' not in s:
    raise SystemExit('v14 base not found')

block=r'''
// ===== V141_INTERPLAY_REST =====
let v141RestToken=0,v141Resting=false;
function v141EnsureRestUi(){
  let el=$('v141RestChip');
  if(el)return el;
  const st=document.createElement('style');
  st.textContent=`#v141RestChip{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:138;pointer-events:none;background:rgba(5,20,22,.92);border:1px solid #5e7774;color:#fff;border-radius:999px;padding:8px 14px;font-weight:950;font-size:13px;box-shadow:0 8px 24px #0008;backdrop-filter:blur(8px)}#v141RestChip b{color:#ffe071;font-size:17px;margin:0 3px}#v141RestChip.hidden{display:none!important}@media(max-width:620px){#v141RestChip{top:68px;font-size:12px;padding:7px 12px}}`;
  document.head.appendChild(st);
  el=document.createElement('div');el.id='v141RestChip';el.className='hidden';document.body.appendChild(el);return el;
}
function v141BeginRest(label='局中休息',onFinish=null){
  const token=++v141RestToken,el=v141EnsureRestUi();
  v141Resting=true;
  if(halfMode==='pitch'&&$('userPitchBtn'))$('userPitchBtn').disabled=true;
  let remain=5;
  const tick=()=>{
    if(token!==v141RestToken)return;
    el.classList.remove('hidden');el.innerHTML=`${label} <b>${remain}</b> 秒`;
    if($('pitchInfo'))$('pitchInfo').textContent=`${label}・${remain} 秒`;
    if(remain<=1){gameSetTimeout(()=>{
      if(token!==v141RestToken)return;
      v141Resting=false;el.classList.add('hidden');
      if(typeof onFinish==='function')onFinish();
    },1000);return}
    remain--;gameSetTimeout(tick,1000);
  };
  tick();
}
const v141RenderUserPitchControlsBase=renderUserPitchControls;
renderUserPitchControls=function(...args){
  const out=v141RenderUserPitchControlsBase(...args);
  if(v141Resting&&halfMode==='pitch'&&$('userPitchBtn'))$('userPitchBtn').disabled=true;
  return out;
};
function v141PitchRest(){
  if(!playing||halfMode!=='pitch'||outs>=3)return;
  v141BeginRest('投球後休息',()=>{
    if(!playing||paused||halfMode!=='pitch'||pitching||outs>=3)return;
    renderUserPitchControls();
    $('userPitchBtn').disabled=false;
    $('pitchInfo').textContent='可以投下一球';
  });
}
const v141ResolveCpuPitchBase=resolveCpuPitch;
resolveCpuPitch=function(...args){
  const beforeBat=cpuBatIndex,beforeMode=halfMode;
  const out=v141ResolveCpuPitchBase(...args);
  if(playing&&beforeMode==='pitch'&&halfMode==='pitch'&&!pitching&&outs<3&&cpuBatIndex===beforeBat)v141PitchRest();
  return out;
};
const v141CompleteCpuPABase=completeCpuPA;
completeCpuPA=function(...args){
  const out=v141CompleteCpuPABase(...args);
  if(playing&&halfMode==='pitch'&&!pitching&&outs<3)v141PitchRest();
  return out;
};
const v141SchedulePitchBase=schedulePitch;
schedulePitch=function(delay=760){
  if(paused||!playing||halfMode!=='bat'||outs>=3)return;
  v141BeginRest('下一球前休息');
  return v141SchedulePitchBase(Math.max(5000,Number(delay)||0));
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
