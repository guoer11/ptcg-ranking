from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')

replacements = [
    (
        "let v20=v20LoadState(),v20Challenge=null,v20PitchClockTimer=0,v20PitchClockLeft=18,v20AnnounceLast='',v20GameMeta=null,v20CpuStarterName='',v20Umpire={x:0,y:0};",
        "let v20=v20LoadState(),v20Challenge=null,v20AnnounceLast='',v20GameMeta=null,v20CpuStarterName='',v20Umpire={x:0,y:0};"
    ),
    (
        '<button id="v20QuickPitch" class="secondary">快速投球：${v20.quickPitch?\'ON\':\'OFF\'}</button><div id="v20PitchClock" class="sub">Pitch Clock 18</div>',
        '<button id="v20QuickPitch" class="secondary">快速投球：${v20.quickPitch?\'ON\':\'OFF\'}</button>'
    ),
    (
        "function v20StartPitchClock(){clearInterval(v20PitchClockTimer);v20PitchClockLeft=18;if($('v20PitchClock'))$('v20PitchClock').textContent='Pitch Clock 18';if(!playing||halfMode!=='pitch')return;v20PitchClockTimer=setInterval(()=>{if(paused)return;v20PitchClockLeft--;if($('v20PitchClock'))$('v20PitchClock').textContent='Pitch Clock '+v20PitchClockLeft;if(v20PitchClockLeft<=0){clearInterval(v20PitchClockTimer);if(playing&&halfMode==='pitch'&&!pitching){balls=Math.min(4,balls+1);setMsg('投球計時違規','自動增加一顆壞球','bad');updateBoard();if(balls>=4)completeCpuPA('BB','四壞保送');else renderUserPitchControls()}}},1000)}\n",
        ""
    ),
    (
        "v20GameMeta={start:Date.now(),mode:v20.mode,umpire:v20Umpire,summary:[]};v20RefreshBatBar();v20CatcherCall();v20StartPitchClock()}",
        "v20GameMeta={start:Date.now(),mode:v20.mode,umpire:v20Umpire,summary:[]};v20RefreshBatBar();v20CatcherCall()}"
    ),
    (
        "const r=v20UserThrowBase();v20StartPitchClock();return r};",
        "const r=v20UserThrowBase();return r};"
    ),
    (
        "v20RefreshBatBar();v20StartPitchClock();return r};",
        "v20RefreshBatBar();return r};"
    ),
    (
        "endGame=function(title){clearInterval(v20PitchClockTimer);const r=v20EndGameBase(title);",
        "endGame=function(title){const r=v20EndGameBase(title);"
    ),
]

for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, got {count}: {old[:120]}')
    s = s.replace(old, new, 1)

for forbidden in ['v20PitchClock', 'v20StartPitchClock', 'Pitch Clock 18', '投球計時違規']:
    if forbidden in s:
        raise SystemExit(f'Pitch clock residue remains: {forbidden}')

path.write_text(s, encoding='utf-8')
print('Removed pitch clock and timeout penalty from baseball-game.html')
