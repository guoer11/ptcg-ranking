from pathlib import Path
p=Path('baseball-game.html')
s=p.read_text()
old="if(!success){v14Game.userE++;setMsg('傳球失誤！','跑者全部安全','bad');return v14FinalizeCpuPA('1B','守備失誤造成上壘')}"
new="if(!success){v14Game.userE++;setMsg('傳球失誤！','跑者全部安全','bad');const ret=v14FinalizeCpuPA('1B','守備失誤造成上壘'),bs=v14BatStat(v14Game.cpuBatters,batter),pl=v14PitchLine(userPitcher?.player);v14Game.cpuH=Math.max(0,v14Game.cpuH-1);if(bs){bs.H=Math.max(0,bs.H-1);bs.S=Math.max(0,bs.S-1)}if(pl)pl.H=Math.max(0,pl.H-1);v14SaveMeta();return ret}"
if old not in s: raise SystemExit('error scoring target missing')
s=s.replace(old,new,1)
p.write_text(s)
