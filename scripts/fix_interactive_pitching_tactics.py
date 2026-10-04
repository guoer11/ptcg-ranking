from pathlib import Path

p=Path('baseball-game.html')
lines=p.read_text(encoding='utf-8').splitlines()
err="$('pinchHitBtn').disabled=halfMode==='pitch';$('pinchRunBtn').disabled=halfMode==='pitch';if(halfMode==='pitch')$('tacticStatus').textContent='目前由你投球；此時可使用換投。';"
lines=[l for l in lines if l.strip()!=err]
found=False
for i,l in enumerate(lines):
    if l.startswith('function renderTactics(){'):
        if "const defenseMode=halfMode==='pitch'" not in l:
            if not l.endswith('}'):
                raise SystemExit('renderTactics unexpected format')
            l=l[:-1]+";const defenseMode=halfMode==='pitch';$('pinchHitterSelect').disabled=defenseMode;$('pinchRunnerSelect').disabled=defenseMode;$('pinchBaseSelect').disabled=defenseMode;$('pinchHitBtn').disabled=defenseMode;$('pinchRunBtn').disabled=defenseMode;if(defenseMode)$('tacticStatus').textContent='目前由你投球；此時可使用換投。';}"
            lines[i]=l
        found=True
    if l.startswith('function renderUserPitchControls(){'):
        lines[i]=l.replace("$('userPitchBtn').disabled=pitching||fat>=1;","$('userPitchBtn').disabled=pitching;")
    if l.startswith('function openTactics(){') and "目前是你投球" not in l:
        lines[i]=l.replace("if(balls||strikes){setMsg('打席進行中','代打請在新打席開始前使用；換投、代跑仍可使用','')}","if(balls||strikes){setMsg('打席進行中',halfMode==='pitch'?'目前是你投球，可換投':'代打請在新打席開始前使用；換投、代跑仍可使用','')}")
if not found: raise SystemExit('renderTactics not found')
p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Fixed pitching-mode tactics safeguards.')
