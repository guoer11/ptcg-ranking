from pathlib import Path
p=Path('baseball-game.html')
s=p.read_text()
if 'V15 IMMERSIVE BASEBALL' not in s:
    raise SystemExit('v15 missing')

old="""function v15HotValue(p,x,y){if(x<0||x>1||y<0||y>1)return 0;const i=Math.min(2,Math.floor(y*3))*3+Math.min(2,Math.floor(x*3));return v15HotZones(p)[i]||0}\nfunction v15RenderHotZone(){const z=$('zone');if(!z)return;let layer=$('v15HotZoneLayer');if(!layer){layer=document.createElement('div');layer.id='v15HotZoneLayer';layer.innerHTML=Array.from({length:9},()=>'<span></span>').join('');z.prepend(layer);const lab=document.createElement('div');lab.className='v15-hot-label';lab.textContent='打者熱區';z.appendChild(lab)}layer.classList.toggle('hidden',!v15Prefs.showHot);const p=halfMode==='pitch'?currentCpuBatter():currentPlayer(),arr=v15HotZones(p);[...layer.children].forEach((c,i)=>{const v=arr[i];c.style.background=v>.25?`rgba(255,75,65,${.05+Math.abs(v)*.075})`:v<-.25?`rgba(60,130,255,${.05+Math.abs(v)*.075})`:'rgba(255,255,255,.018)'})}\n"""
new="""function v15HotValue(p,x,y){if(x<0||x>1||y<0||y>1)return 0;const i=Math.min(2,Math.floor(y*3))*3+Math.min(2,Math.floor(x*3));return v15HotZones(p)[i]||0}\nfunction v15PitchZones(p){if(!p)return Array(9).fill(0);const id=playerId(p),r=pitcherRatings(p);return Array.from({length:9},(_,i)=>clamp((v15Hash(id+'pzone'+i)-.5)*2+(r.control-70)/28+(i===6||i===8?.18:0),-2,2))}\nfunction v15PitchZoneValue(p,x,y){if(!p||x<0||x>1||y<0||y>1)return 0;const i=Math.min(2,Math.floor(y*3))*3+Math.min(2,Math.floor(x*3));return v15PitchZones(p)[i]||0}\nfunction v15RenderHotZone(){const z=$('zone');if(!z)return;let layer=$('v15HotZoneLayer');if(!layer){layer=document.createElement('div');layer.id='v15HotZoneLayer';layer.innerHTML=Array.from({length:9},()=>'<span></span>').join('');z.prepend(layer);const lab=document.createElement('div');lab.className='v15-hot-label';lab.textContent='紅=打者強區・藍=弱區・綠框=投手擅長區';z.appendChild(lab)}layer.classList.toggle('hidden',!v15Prefs.showHot);const p=halfMode==='pitch'?currentCpuBatter():currentPlayer(),pit=halfMode==='pitch'?userPitcher?.player:cpuPitcher?.player,arr=v15HotZones(p),pz=v15PitchZones(pit);[...layer.children].forEach((c,i)=>{const v=arr[i],pv=pz[i]||0;c.style.background=v>.25?`rgba(255,75,65,${.05+Math.abs(v)*.075})`:v<-.25?`rgba(60,130,255,${.05+Math.abs(v)*.075})`:'rgba(255,255,255,.018)';c.style.boxShadow=pv>.45?`inset 0 0 0 ${pv>1.1?2:1}px rgba(95,245,155,${.28+pv*.16})`:'none'})}\n"""
if old not in s: raise SystemExit('hot zone block not found')
s=s.replace(old,new,1)

old="const f=v15WorkFatigue(st.player),tr=v15Traits(st.player,true),d=v15Diff(),isCpu=st===cpuPitcher;"
new="const isCpu=st===cpuPitcher,f=isCpu?0:v15WorkFatigue(st.player),tr=v15Traits(st.player,true),d=v15Diff();"
if old not in s: raise SystemExit('pitch fatigue line missing')
s=s.replace(old,new,1)

old="catcherPenalty=clamp((72-catcherArmRating())*.0015,-.02,.03)"
new="catcherPenalty=clamp((72-cpuDefenseRating())*.0015,-.02,.03)"
if old not in s: raise SystemExit('passed ball catcher line missing')
s=s.replace(old,new,1)

s=s.replace("if(pitchTargetY<.92||Math.random()>=chance)return false;","if(pitchTargetY<=1||Math.random()>=chance)return false;",1)
s=s.replace("if(pitchTargetY<.96||Math.random()>=chance)return false;","if(pitchTargetY<=1||Math.random()>=chance)return false;",1)

old="""function v15StatusText(p,pitch=false){const inj=v15Injury(p);if(inj&&inj.games>0)return`🩹 缺陣 ${inj.games} 場`;if(pitch){const f=v15WorkFatigue(p);return f>.28?'🔴 牛棚疲勞':f>.10?'🟡 尚未完全恢復':'🟢 體力正常'}const f=v15BatterFatigue(p);return f>.07?'🟡 連戰疲勞':'🟢 狀態正常'}"""
new="""function v15StatusText(p,pitch=false){const inj=v15Injury(p);if(inj&&inj.games>0)return`🩹 缺陣 ${inj.games} 場`;if(pitch){const f=v15WorkFatigue(p),x=v15Profile.pitchers[playerId(p)],used=x?.pitches?`・上場 ${x.pitches} 球`:'';return(f>.28?'🔴 牛棚疲勞':f>.10?'🟡 尚未完全恢復':'🟢 體力正常')+used}const f=v15BatterFatigue(p);return f>.07?'🟡 連戰疲勞':'🟢 狀態正常'}"""
if old not in s: raise SystemExit('status text missing')
s=s.replace(old,new,1)

anchor="""// Errors on both sides, with visible animation.\n"""
insert="""// Pitcher command-zone bonus for user pitching.\nconst v15UserThrowPitchBase=userThrowPitch;\nuserThrowPitch=function(){const r=v15UserThrowPitchBase();if(pitching&&halfMode==='pitch'&&userPitcher?.player){const z=v15PitchZoneValue(userPitcher.player,aimX,aimY);if(z>.35){const keep=clamp(.88-z*.08,.68,.88);pitchTargetX=aimX+(pitchTargetX-aimX)*keep;pitchTargetY=aimY+(pitchTargetY-aimY)*keep}}return r};\n\n"""
if anchor not in s: raise SystemExit('error anchor missing')
s=s.replace(anchor,insert+anchor,1)
p.write_text(s)
