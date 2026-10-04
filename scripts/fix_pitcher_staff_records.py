from pathlib import Path
p=Path('baseball-game.html')
t=p.read_text(encoding='utf-8')
old="function endGame(title){playing=false;clearMotion();$('swingBtn').disabled=true;$('tacticsBtn').disabled=true;db.games.unshift({date:new Date().toISOString(),opp:opponent,us:userScore,them:cpuScore,park:config.park,pitcher:userPitcher?.player?.name,substitutions,lineup:lineup.map(p=>({name:p.name,team:p.teamName,pos:positionMap[playerId(p)]}))});db.games=db.games.slice(0,40);saveDb();$('gameOverTitle').textContent=title;$('gameOverText').textContent=`自選明星隊 ${userScore}：${cpuScore} ${teams[opponent].name}｜${currentPark().name}｜先發 ${userPitcher?.player?.name||'—'}`;$('gameOverOverlay').classList.remove('hidden')}"
new="function endGame(title){playing=false;clearMotion();$('swingBtn').disabled=true;$('tacticsBtn').disabled=true;const starter=players.find(p=>playerId(p)===config.starterPitcherId),staff=staffIds().map(id=>players.find(p=>playerId(p)===id)).filter(Boolean);db.games.unshift({date:new Date().toISOString(),opp:opponent,us:userScore,them:cpuScore,park:config.park,pitcher:starter?.name||'—',pitcherStaff:staff.map(p=>({name:p.name,role:staffRole(playerId(p))})),substitutions,lineup:lineup.map(p=>({name:p.name,team:p.teamName,pos:positionMap[playerId(p)]}))});db.games=db.games.slice(0,40);saveDb();$('gameOverTitle').textContent=title;$('gameOverText').textContent=`自選明星隊 ${userScore}：${cpuScore} ${teams[opponent].name}｜${currentPark().name}｜先發 ${starter?.name||'—'}｜終場投手 ${userPitcher?.player?.name||'—'}`;$('gameOverOverlay').classList.remove('hidden')}"
if old not in t: raise SystemExit('endGame target not found')
t=t.replace(old,new,1)
p.write_text(t,encoding='utf-8')
print('Fixed pitcher staff game records.')
