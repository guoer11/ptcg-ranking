from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')
old = "function visiblePitchers(){let list=players.filter(p=>p.pitching&&(pitcherFilterTeam==='all'||p.teamKey===pitcherFilterTeam)&&(!pitcherSearch||p.name.includes(pitcherSearch)));"
new = "function visiblePitchers(){let list=players.filter(p=>p.pitching&&!lineup.some(x=>playerId(x)===playerId(p))&&(pitcherFilterTeam==='all'||p.teamKey===pitcherFilterTeam)&&(!pitcherSearch||p.name.includes(pitcherSearch)));"
if old not in text:
    raise SystemExit('visiblePitchers target not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Prevented hitters from also occupying pitcher-staff slots.')
