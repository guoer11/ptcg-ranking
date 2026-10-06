from pathlib import Path
p=Path('baseball-game.html')
s=p.read_text()

def between(start,end,new):
    global s
    a=s.find(start)
    if a<0: raise SystemExit('missing '+start)
    b=s.find(end,a)
    if b<0: raise SystemExit('missing '+end)
    s=s[:a]+new.rstrip()+'\n'+s[b:]

between('function v14RecordUserPA(', 'function v14Ip(', r'''function v14RecordUserPA(result,p,runs,pitcher,inn=inning){if(!v14Game||!p)return;const s=v14BatStat(v14Game.batters,p);s.AB+=result==='BB'?0:1;s.BB+=result==='BB'?1:0;s.K+=result==='K'?1:0;if(['1B','2B','3B','HR'].includes(result)){s.H++;v14Game.userH++;if(result==='1B')s.S++;if(result==='2B')s.D2++;if(result==='3B')s.D3++;if(result==='HR')s.HR++}s.RBI+=runs||0;v14Game.innings.user[Math.min(11,Math.max(0,inn-1))]+=runs||0;const pl=v14PitchLine(pitcher);if(pl){pl.H+=['1B','2B','3B','HR'].includes(result)?1:0;pl.BB+=result==='BB'?1:0;pl.K+=result==='K'?1:0;pl.outs+=['K','OUT','DP'].includes(result)?(result==='DP'?2:1):0;pl.R+=runs||0;pl.ER+=runs||0;pl.pitches=cpuPitcher?.pitches||pl.pitches}}
function v14RecordCpuPA(result,p,runs,pitcher,inn=inning){if(!v14Game||!p)return;const s=v14BatStat(v14Game.cpuBatters,p);s.AB+=result==='BB'?0:1;s.BB+=result==='BB'?1:0;s.K+=result==='K'?1:0;if(['1B','2B','3B','HR'].includes(result)){s.H++;v14Game.cpuH++;if(result==='1B')s.S++;if(result==='2B')s.D2++;if(result==='3B')s.D3++;if(result==='HR')s.HR++}s.RBI+=runs||0;v14Game.innings.cpu[Math.min(11,Math.max(0,inn-1))]+=runs||0;const pl=v14PitchLine(pitcher);if(pl){pl.H+=['1B','2B','3B','HR'].includes(result)?1:0;pl.BB+=result==='BB'?1:0;pl.K+=result==='K'?1:0;pl.outs+=result==='DP'?2:(['K','OUT','FC'].includes(result)?1:0);pl.R+=runs||0;pl.ER+=runs||0;pl.pitches=userPitcher?.pitches||pl.pitches}}
''')

between('function v14ResolveDefense(', 'function v14WarmProgress(', r'''function v14ResolveDefense(target){const ctx=v14PendingDefense;if(!ctx)return;$('v14DefenseOverlay').classList.add('hidden');v14PendingDefense=null;const pre=bases.map(x=>x),batter=ctx.batter,success=Math.random()<v14DefenseProb(target,batter);if(!success){v14Game.userE++;setMsg('傳球失誤！','跑者全部安全','bad');return v14FinalizeCpuPA('1B','守備失誤造成上壘')}
if(target==='1B')return v14FinalizeCpuPA('OUT','傳一壘刺殺');
if(target==='2B'&&pre[0]){const dp=ctx.result==='DP'&&outs<2&&Math.random()<.66;if(dp)return v14FinalizeCpuPA('DP','二壘封殺再轉一壘雙殺');const oldIndex=cpuBatIndex%9,r=runnerObj(batter,oldIndex);v14FinalizeCpuPA('FC','二壘封殺');if(playing&&halfMode==='pitch'){bases[0]=r;updateBoard();saveGameState()}return}
if(target==='3B'&&pre[1]){const oldIndex=cpuBatIndex%9,r=runnerObj(batter,oldIndex);v14FinalizeCpuPA('FC','三壘觸殺');if(playing&&halfMode==='pitch'){bases[2]=pre[2];bases[1]=pre[0];bases[0]=r;updateBoard();saveGameState()}return}
if(target==='HOME'&&pre[2]){const oldIndex=cpuBatIndex%9,r=runnerObj(batter,oldIndex);v14FinalizeCpuPA('FC','本壘觸殺');if(playing&&halfMode==='pitch'){bases[2]=pre[1];bases[1]=pre[0];bases[0]=r;updateBoard();saveGameState()}return}
return v14FinalizeCpuPA('OUT','守備刺殺')}
''')

old="function v14CpuSacBunt(){const b=currentCpuBatter();finalizeUserPitch('犧牲觸擊');outs++;bases[1]=bases[0];bases[0]=null;cpuBatIndex=(cpuBatIndex+1)%Math.max(1,cpuBattingOrder().length);balls=strikes=0;setMsg('CPU教練下令短打',`${b.name} 犧牲觸擊，跑者推進`,'');updateBoard();saveGameState();if(outs>=3)return endHalf();showIntro();renderUserPitchControls();$('userPitchBtn').disabled=false}"
new="function v14CpuSacBunt(){const b=currentCpuBatter(),inn=inning;finalizeUserPitch('犧牲觸擊');outs++;bases[1]=bases[0];bases[0]=null;v14RecordCpuPA('OUT',b,0,userPitcher?.player,inn);v14SetReplay('user','OUT','犧牲觸擊',null);cpuBatIndex=(cpuBatIndex+1)%Math.max(1,cpuBattingOrder().length);balls=strikes=0;setMsg('CPU教練下令短打',`${b.name} 犧牲觸擊，跑者推進`,'');updateBoard();saveGameState();if(outs>=3)return endHalf();showIntro();renderUserPitchControls();$('userPitchBtn').disabled=false}"
if old not in s: raise SystemExit('sac bunt target missing')
s=s.replace(old,new,1)

old="completePA=function(result,label='',choice='hold'){const p=currentPlayer(),pit=cpuPitcher?.player,score=userScore,inn=inning;const ret=v14CompleteUserPA(result,label,choice),runs=Math.max(0,userScore-score);v14RecordUserPA(result,p,runs,pit);if(result==='K')v14SetReplay('cpu','K','三振',null);v14SaveMeta();return ret};"
new="completePA=function(result,label='',choice='hold'){const p=currentPlayer(),pit=cpuPitcher?.player,score=userScore,inn=inning;const ret=v14CompleteUserPA(result,label,choice),runs=Math.max(0,userScore-score);v14RecordUserPA(result,p,runs,pit,inn);if(result==='K')v14SetReplay('cpu','K','三振',null);v14SaveMeta();return ret};"
if old not in s: raise SystemExit('user PA wrapper missing')
s=s.replace(old,new,1)

old="function v14FinalizeCpuPA(result,label=''){const p=currentCpuBatter(),pit=userPitcher?.player,score=cpuScore,ret=v14CompleteCpuPAOriginal(result==='FC'?'OUT':result,label),runs=Math.max(0,cpuScore-score);v14RecordCpuPA(result,p,runs,pit);if(result==='K')v14SetReplay('user','K','三振',null);v14SaveMeta();return ret}"
new="function v14FinalizeCpuPA(result,label=''){const p=currentCpuBatter(),pit=userPitcher?.player,score=cpuScore,inn=inning,ret=v14CompleteCpuPAOriginal(result==='FC'?'OUT':result,label),runs=Math.max(0,cpuScore-score);v14RecordCpuPA(result,p,runs,pit,inn);if(result==='K')v14SetReplay('user','K','三振',null);v14SaveMeta();return ret}"
if old not in s: raise SystemExit('cpu PA wrapper missing')
s=s.replace(old,new,1)

old="if(Object.values(v14Game.pitchers).filter(x=>x.team!==teams[opponent]?.name).reduce((n,x)=>n+x.K,0)>=10&&v14Unlock('tenK'))got.push('K博士');"
new="if(Object.entries(v14Game.pitchers).filter(([id])=>usedPitchers.has(id)).reduce((n,[,x])=>n+x.K,0)>=10&&v14Unlock('tenK'))got.push('K博士');"
if old not in s: raise SystemExit('10K target missing')
s=s.replace(old,new,1)

old="const v14ReturnSetup=returnToSetup;\nreturnToSetup=function(){const r=v14ReturnSetup();v14RenderSeason();v14RenderAchievements();return r};"
new="const v14ReturnSetup=returnToSetup;\nreturnToSetup=function(){const wasPlaying=playing,r=v14ReturnSetup();if(wasPlaying){v14SeasonMode=false;v14ClearMeta()}v14RenderSeason();v14RenderAchievements();return r};"
if old not in s: raise SystemExit('return setup wrapper missing')
s=s.replace(old,new,1)

p.write_text(s)
