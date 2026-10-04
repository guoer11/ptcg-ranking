from pathlib import Path

p = Path('baseball-game.html')
s = p.read_text(encoding='utf-8')

old_types = "const basePitchTypes={FF:{n:'四縫線',delta:0,c:7,drop:3},SI:{n:'二縫線',delta:-4,c:16,drop:7},SL:{n:'滑球',delta:-12,c:32,drop:12},CH:{n:'變速球',delta:-20,c:11,drop:21},CU:{n:'曲球',delta:-25,c:22,drop:35}};"
new_types = "const basePitchTypes={FF:{n:'四縫線',delta:0,c:7,drop:3},SI:{n:'二縫線／伸卡',delta:-4,c:16,drop:9},CT:{n:'卡特球',delta:-6,c:23,drop:8},SL:{n:'滑球',delta:-12,c:32,drop:12},SW:{n:'Sweeper',delta:-14,c:43,drop:9},CH:{n:'變速球',delta:-20,c:11,drop:23},FS:{n:'指叉球',delta:-18,c:8,drop:33},CU:{n:'曲球',delta:-25,c:22,drop:38}};"
if old_types not in s:
    raise SystemExit('basePitchTypes anchor not found')
s = s.replace(old_types, new_types, 1)

old_ratings = "function pitcherRatings(p){const id=playerId(p),ps=p.pitching||{},outs=num(ps.IP_outs)||0,w=clamp(outs/120,0,1),era=num(ps.ERA)??4.2,whip=num(ps.WHIP)??1.4,k9=num(ps.K9)??7,bb9=num(ps.BB9)??3.2,gs=num(ps.GS)||0,g=Math.max(1,num(ps.G)||1);const velo=clamp(Math.round(65+h01(id,'pv')*20+(k9-7)*1.15*w),50,97),control=clamp(Math.round(63+h01(id,'pc')*18+(3.2-bb9)*4.5*w+(1.4-whip)*8*w),45,98),brk=clamp(Math.round(62+h01(id,'pb')*19+(k9-7)*2.2*w+(4.2-era)*1.4*w),45,98),stamina=clamp(Math.round(55+h01(id,'ps')*17+(gs/g)*18+Math.min(outs/3,120)*.09),45,98);const perf=clamp((4.2-era)*2.2+(1.4-whip)*7, -8, 10)*w;const all=['FF','SI','SL','CH','CU'],count=3+(h01(id,'pn')>.56?1:0)+(h01(id,'pn2')>.83?1:0),rep=['FF',...all.slice(1).sort((a,b)=>h01(id,a)-h01(id,b)).slice(0,count-1)];return{velo,control,break:brk,stamina,overall:clamp(Math.round((velo+control+brk+stamina*.72)/3.72+perf),45,99),repertoire:rep}}"
new_ratings = """const knownPitchRepertoires={
'羅戈':['FF','CU','CH','SL','CT'],
'飛力獅':['FF','SL','CH','SI','CU','FS','CT'],
'徐若熙':['FF','CH','CU','SL','CT'],
'王尉永':['FF','SL','FS'],
'林暉盛':['FF','CU','CH','SL']
};
function buildPitcherRepertoire(p,brk,control,k9,bb9,gs,g){const known=knownPitchRepertoires[p.name];if(known)return{rep:known,source:'公開球種'};const id=playerId(p),starter=(gs/Math.max(1,g))>=.32||gs>=5;const target=starter?(5+(h01(id,'pn')>.45?1:0)+(h01(id,'pn2')>.82?1:0)):(3+(h01(id,'pn')>.42?1:0)+(h01(id,'pn2')>.78?1:0));const pool=['SI','CT','SL','SW','CH','FS','CU'];const score=k=>{let v=h01(id,'rep-'+k)*1.25;if(k==='SI')v+=(control-60)/120;if(k==='CT')v+=(control-58)/105;if(k==='SL')v+=(brk-55)/85+(k9-6)/35;if(k==='SW')v+=(brk-64)/72+(k9-7)/32;if(k==='CH')v+=(control-55)/115+(3.5-bb9)/22;if(k==='FS')v+=(k9-6.5)/25+(brk-58)/120;if(k==='CU')v+=(brk-55)/90+(starter?.12:0);return v};const ranked=pool.sort((a,b)=>score(b)-score(a));return{rep:['FF',...ranked.slice(0,clamp(target-1,2,7))],source:'遊戲模型'}}
function pitcherRatings(p){const id=playerId(p),ps=p.pitching||{},outs=num(ps.IP_outs)||0,w=clamp(outs/120,0,1),era=num(ps.ERA)??4.2,whip=num(ps.WHIP)??1.4,k9=num(ps.K9)??7,bb9=num(ps.BB9)??3.2,gs=num(ps.GS)||0,g=Math.max(1,num(ps.G)||1);const velo=clamp(Math.round(65+h01(id,'pv')*20+(k9-7)*1.15*w),50,97),control=clamp(Math.round(63+h01(id,'pc')*18+(3.2-bb9)*4.5*w+(1.4-whip)*8*w),45,98),brk=clamp(Math.round(62+h01(id,'pb')*19+(k9-7)*2.2*w+(4.2-era)*1.4*w),45,98),stamina=clamp(Math.round(55+h01(id,'ps')*17+(gs/g)*18+Math.min(outs/3,120)*.09),45,98);const perf=clamp((4.2-era)*2.2+(1.4-whip)*7,-8,10)*w,{rep,source}=buildPitcherRepertoire(p,brk,control,k9,bb9,gs,g);return{velo,control,break:brk,stamina,overall:clamp(Math.round((velo+control+brk+stamina*.72)/3.72+perf),45,99),repertoire:rep,repertoireSource:source}}"""
if old_ratings not in s:
    raise SystemExit('pitcherRatings anchor not found')
s = s.replace(old_ratings, new_ratings, 1)

old_choose = "function choosePitch(pr){const rep=pr.repertoire;const weights=rep.map(k=>k==='FF'?3:k==='SI'?2.2:k==='SL'?2:k==='CH'?1.5:1.35);let r=Math.random()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<rep.length;i++){r-=weights[i];if(r<=0)return rep[i]}return rep[0]}"
new_choose = "function choosePitch(pr){const rep=pr.repertoire;const weight={FF:3.0,SI:2.15,CT:1.7,SL:2.05,SW:1.55,CH:1.65,FS:1.55,CU:1.45},weights=rep.map(k=>weight[k]||1.4);let r=Math.random()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<rep.length;i++){r-=weights[i];if(r<=0)return rep[i]}return rep[0]}"
if old_choose not in s:
    raise SystemExit('choosePitch anchor not found')
s = s.replace(old_choose, new_choose, 1)

old_render = "function renderUserPitchControls(){if(!userPitcher)return;const pr=currentPitcherRatings(userPitcher),rep=pr.repertoire||['FF'];if(!rep.includes(selectedUserPitch))selectedUserPitch=rep[0];$('pitchTypeButtons').innerHTML=Object.entries(basePitchTypes).map(([code,p])=>`<button class=\"pitch-type ${selectedUserPitch===code?'active':''}\" data-user-pitch=\"${code}\" ${rep.includes(code)?'':'disabled'}>${p.n}</button>`).join('');qsa('[data-user-pitch]').forEach(b=>b.onclick=()=>{selectedUserPitch=b.dataset.userPitch;renderUserPitchControls()});$('userPitcherLabel').textContent=`${userPitcher.player.name}・${userPitcher.role}`;$('cpuBatterLabel').textContent=`${currentCpuBatter()?.name||'—'}｜${userPitcher.pitches} 球`;const fat=pitcherFatigue(userPitcher);$('userPitchBtn').disabled=pitching;$('userPitchBtn').textContent=fat>.82?'投球（疲勞）':'投球！'}"
new_render = "function renderUserPitchControls(){if(!userPitcher)return;const pr=currentPitcherRatings(userPitcher),rep=pr.repertoire||['FF'];if(!rep.includes(selectedUserPitch))selectedUserPitch=rep[0];$('pitchTypeButtons').innerHTML=rep.map(code=>{const p=basePitchTypes[code];return p?`<button class=\"pitch-type ${selectedUserPitch===code?'active':''}\" data-user-pitch=\"${code}\">${p.n}</button>`:''}).join('');qsa('[data-user-pitch]').forEach(b=>b.onclick=()=>{selectedUserPitch=b.dataset.userPitch;renderUserPitchControls()});$('userPitcherLabel').textContent=`${userPitcher.player.name}・${userPitcher.role}｜${rep.length}種球・${pr.repertoireSource||'遊戲模型'}`;$('cpuBatterLabel').textContent=`${currentCpuBatter()?.name||'—'}｜${userPitcher.pitches} 球`;const fat=pitcherFatigue(userPitcher);$('userPitchBtn').disabled=pitching;$('userPitchBtn').textContent=fat>.82?'投球（疲勞）':'投球！'}"
if old_render not in s:
    raise SystemExit('renderUserPitchControls anchor not found')
s = s.replace(old_render, new_render, 1)

p.write_text(s, encoding='utf-8')
print('Expanded pitch repertoire successfully')
