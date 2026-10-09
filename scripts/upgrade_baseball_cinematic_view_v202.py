from pathlib import Path
import re

html = Path('baseball-game.html')
s = html.read_text(encoding='utf-8')

if 'V202 CINEMATIC CAMERA' in s:
    raise SystemExit('v2.0.2 cinematic camera already installed')
if 'V15 IMMERSIVE BASEBALL' not in s or 'V20 MEGA BASEBALL' not in s:
    raise SystemExit('Expected v15/v20 baseball base not found')

css = r'''

/* ===== V202 CINEMATIC CAMERA ===== */
#gameApp.v202-cinematic-game{position:relative;background:#02090b}
#gameApp.v202-cinematic-game .gamebar{position:absolute;left:0;right:0;top:env(safe-area-inset-top);height:46px;z-index:76;background:linear-gradient(180deg,rgba(5,12,15,.94),rgba(8,18,20,.78));border-bottom:1px solid #ffffff24;backdrop-filter:blur(7px);padding:3px 8px}
#gameApp.v202-cinematic-game .scoreteam{font-size:15px;text-shadow:0 2px 5px #000}
#gameApp.v202-cinematic-game .centerScore{font-size:9px}
#gameApp.v202-cinematic-game .centerScore b{font-size:12px}
#gameApp.v202-cinematic-game .minirow{gap:5px;margin-top:1px}
#gameApp.v202-cinematic-game .scene{padding-top:0}
#gameApp.v202-cinematic-game .hud{top:54px;left:7px;background:rgba(4,13,15,.74);border-radius:7px;padding:5px 7px;max-width:46%;font-size:9px}
#gameApp.v202-cinematic-game .batterCard{top:54px;right:7px;background:rgba(4,13,15,.76);border-radius:7px;padding:6px 8px;max-width:47%;font-size:9px}
#gameApp.v202-cinematic-game .batterCard strong{font-size:13px}
#gameApp.v202-cinematic-game .message{top:14%;width:72%}
#gameApp.v202-cinematic-game .message strong{font-size:24px}
#gameApp.v202-cinematic-game .v15-wind{top:102px}

/* Batter camera: low camera beside the hitter, pitcher centered in the distance. */
.scene.v202-cinematic-bat:not(.user-pitching){perspective:1200px;background:linear-gradient(#66b8ed 0 31%,#bddff0 32%,#477553 33%,#173c27 100%)}
.scene.v202-cinematic-bat:not(.user-pitching) .stadium{top:17%;height:27%;left:-9%;right:-9%;filter:brightness(.98) saturate(1.05)}
.scene.v202-cinematic-bat:not(.user-pitching) .crowd{top:23%;height:17%}
.scene.v202-cinematic-bat:not(.user-pitching) .scoreboardBig{top:19%;width:21%;height:8%;opacity:.92}
.scene.v202-cinematic-bat:not(.user-pitching) .outfield{top:38%;left:-10%;right:-10%;bottom:-20%;clip-path:polygon(1% 0,99% 0,78% 100%,22% 100%)}
.scene.v202-cinematic-bat:not(.user-pitching) .infieldDirt{top:73%;width:min(108vw,900px);height:min(72vw,650px)}
.scene.v202-cinematic-bat:not(.user-pitching) .infieldGrass{top:69%;width:min(72vw,610px);height:min(47vw,430px)}
.scene.v202-cinematic-bat:not(.user-pitching) .mound{top:48%;transform:translate(-50%,-50%) scale(.82)}
.scene.v202-cinematic-bat:not(.user-pitching) .pitcher{top:43.5%;transform:translate(-50%,-50%) scale(.68);z-index:15}
.scene.v202-cinematic-bat:not(.user-pitching) .zone{bottom:13%;width:108px;height:134px;border-color:rgba(255,255,255,.72);background:rgba(255,255,255,.018)}
.scene.v202-cinematic-bat:not(.user-pitching) .batter{--bscale:1.22;right:-5%;bottom:1%;z-index:20}
.scene.v202-cinematic-bat:not(.user-pitching) .bat{right:-1%;bottom:22%;height:164px;z-index:21}
.scene.v202-cinematic-bat.bat-left:not(.user-pitching) .batter{right:auto;left:-5%;transform-origin:0 100%}
.scene.v202-cinematic-bat.bat-left:not(.user-pitching) .bat{right:auto;left:-1%;transform:rotate(-28deg)}
.scene.v202-cinematic-bat:not(.user-pitching) .catcher,.scene.v202-cinematic-bat:not(.user-pitching) .umpire{opacity:.20;transform:translateX(-50%) scale(.55)}
.scene.v202-cinematic-bat:not(.user-pitching) .fielder{opacity:.84}
.scene.v202-cinematic-bat:not(.user-pitching) .f-lf{top:43%}.scene.v202-cinematic-bat:not(.user-pitching) .f-cf{top:40%}.scene.v202-cinematic-bat:not(.user-pitching) .f-rf{top:43%}
.scene.v202-cinematic-bat:not(.user-pitching) .f-ss,.scene.v202-cinematic-bat:not(.user-pitching) .f-2b{top:54%}

/* Pitcher camera: pitcher fills foreground; catcher and batter sit at the far plate. */
.scene.user-pitching.v202-cinematic-pitch{perspective:1250px;background:linear-gradient(#65b8ed 0 31%,#c0e4f3 32%,#4e7d58 33%,#173b27 100%)}
.scene.user-pitching.v202-cinematic-pitch .stadium{top:16%;height:27%;left:-8%;right:-8%}
.scene.user-pitching.v202-cinematic-pitch .crowd{top:22%;height:16%}
.scene.user-pitching.v202-cinematic-pitch .outfield{top:37%;left:-9%;right:-9%;bottom:-22%}
.scene.user-pitching.v202-cinematic-pitch .infieldDirt{top:62%;width:min(86vw,720px);height:min(58vw,510px)}
.scene.user-pitching.v202-cinematic-pitch .infieldGrass{top:59%;width:min(58vw,500px);height:min(39vw,365px)}
.scene.user-pitching.v202-cinematic-pitch .mound{top:79%;width:98px;height:34px;z-index:12}
.scene.user-pitching.v202-cinematic-pitch .pitcher{left:50%;top:80%;transform:translate(-50%,-50%) scale(1.22);z-index:25;filter:drop-shadow(0 10px 7px rgba(0,0,0,.4))}
.scene.user-pitching.v202-cinematic-pitch .zone{bottom:43%;width:80px;height:100px;border-color:rgba(255,255,255,.78);z-index:20}
.scene.user-pitching.v202-cinematic-pitch .batter{--bscale:.46;right:21%;bottom:41.5%;z-index:19}
.scene.user-pitching.v202-cinematic-pitch.bat-left .batter{right:auto;left:21%;transform-origin:0 100%}
.scene.user-pitching.v202-cinematic-pitch .bat{right:22%;bottom:45%;height:76px;z-index:20}
.scene.user-pitching.v202-cinematic-pitch.bat-left .bat{right:auto;left:22%;transform:rotate(-28deg)}
.scene.user-pitching.v202-cinematic-pitch .catcher{bottom:40%;transform:translateX(-50%) scale(.50);z-index:18;opacity:.96}
.scene.user-pitching.v202-cinematic-pitch .umpire{bottom:39%;transform:translateX(-50%) scale(.46);z-index:17;opacity:.78}
.scene.user-pitching.v202-cinematic-pitch .fielder{opacity:.70;transform:translate(-50%,-50%) scale(.38)}
.scene.user-pitching.v202-cinematic-pitch .base{transform:rotate(45deg) scale(.72)}
.scene.user-pitching.v202-cinematic-pitch .pitcher.windup{animation:v202PitchWindup .58s cubic-bezier(.2,.7,.2,1)}
.scene.user-pitching.v202-cinematic-pitch .pitcher.release{animation:v202PitchRelease .34s cubic-bezier(.15,.8,.2,1)}
@keyframes v202PitchWindup{0%{transform:translate(-50%,-50%) scale(1.22) rotate(0)}40%{transform:translate(-50%,-52%) scale(1.22) rotate(-4deg)}72%{transform:translate(-50%,-51%) scale(1.22) rotate(-8deg)}100%{transform:translate(-50%,-50%) scale(1.22) rotate(-5deg)}}
@keyframes v202PitchRelease{0%{transform:translate(-50%,-50%) scale(1.22) rotate(-5deg)}52%{transform:translate(-47%,-49%) scale(1.22) rotate(11deg)}100%{transform:translate(-46%,-48%) scale(1.22) rotate(7deg)}}

/* Pitch selection becomes an overlay, similar to the reference game's edge HUD. */
#gameApp.v202-mode-pitch .pitch-mode-panel{position:absolute;z-index:72;left:8px;right:8px;bottom:70px;margin:0;padding:7px 8px;background:linear-gradient(180deg,rgba(6,17,19,.88),rgba(5,13,15,.76));border:1px solid #ffffff2c;border-radius:13px;backdrop-filter:blur(7px);box-shadow:0 5px 18px #0007}
#gameApp.v202-mode-pitch .pitch-mode-top{gap:5px;font-size:9px}
#gameApp.v202-mode-pitch .pitch-mode-top strong{font-size:10px}
#gameApp.v202-mode-pitch .pitch-help{display:none}
#gameApp.v202-mode-pitch .pitch-defense-actions{margin:3px 0}
#gameApp.v202-mode-pitch .pitch-types{display:flex;gap:5px;overflow-x:auto;padding:3px 0;scrollbar-width:none}
#gameApp.v202-mode-pitch .pitch-types::-webkit-scrollbar{display:none}
#gameApp.v202-mode-pitch .pitch-type{flex:0 0 auto;min-width:72px;min-height:38px;padding:5px 7px;border-radius:10px}
#gameApp.v202-mode-pitch .pitch-chart-btn{padding:4px 7px;font-size:9px}

@media (orientation:landscape){
  #gameApp.v202-cinematic-game .gamebar{height:38px;top:0}
  #gameApp.v202-cinematic-game .hud,#gameApp.v202-cinematic-game .batterCard{top:43px}
  #gameApp.v202-cinematic-game .message{top:12%}
  #gameApp.v202-cinematic-game .v15-wind{top:82px}
  .scene.v202-cinematic-bat:not(.user-pitching) .batter{--bscale:1.02;right:1%;bottom:-5%}
  .scene.v202-cinematic-bat.bat-left:not(.user-pitching) .batter{right:auto;left:1%}
  .scene.v202-cinematic-bat:not(.user-pitching) .bat{right:5%;bottom:22%;height:148px}
  .scene.v202-cinematic-bat.bat-left:not(.user-pitching) .bat{right:auto;left:5%}
  .scene.v202-cinematic-bat:not(.user-pitching) .zone{bottom:10%;width:94px;height:116px}
  .scene.v202-cinematic-bat:not(.user-pitching) .pitcher{top:43%;transform:translate(-50%,-50%) scale(.58)}
  .scene.user-pitching.v202-cinematic-pitch .pitcher{top:82%;transform:translate(-50%,-50%) scale(1.04)}
  .scene.user-pitching.v202-cinematic-pitch .pitcher.windup{animation-name:v202PitchWindupLandscape}
  .scene.user-pitching.v202-cinematic-pitch .pitcher.release{animation-name:v202PitchReleaseLandscape}
  @keyframes v202PitchWindupLandscape{0%{transform:translate(-50%,-50%) scale(1.04)}55%{transform:translate(-50%,-52%) scale(1.04) rotate(-7deg)}100%{transform:translate(-50%,-50%) scale(1.04) rotate(-5deg)}}
  @keyframes v202PitchReleaseLandscape{0%{transform:translate(-50%,-50%) scale(1.04) rotate(-5deg)}55%{transform:translate(-47%,-49%) scale(1.04) rotate(10deg)}100%{transform:translate(-46%,-48%) scale(1.04) rotate(7deg)}}
  .scene.user-pitching.v202-cinematic-pitch .zone{bottom:39%;width:70px;height:86px}
  .scene.user-pitching.v202-cinematic-pitch .batter{--bscale:.38;right:25%;bottom:37.5%}
  .scene.user-pitching.v202-cinematic-pitch.bat-left .batter{right:auto;left:25%}
  .scene.user-pitching.v202-cinematic-pitch .catcher{bottom:36%;transform:translateX(-50%) scale(.42)}
  .scene.user-pitching.v202-cinematic-pitch .umpire{bottom:35%;transform:translateX(-50%) scale(.39)}
  #gameApp.v202-mode-pitch .pitch-mode-panel{left:1.5%;right:auto;width:min(58vw,620px);bottom:7px;padding:5px 6px}
  #gameApp.v202-mode-pitch .pitch-type{min-width:64px;min-height:32px;font-size:10px}
}

@media (orientation:portrait){
  .scene.v202-cinematic-bat:not(.user-pitching) .batter{--bscale:1.32;right:-12%}
  .scene.v202-cinematic-bat.bat-left:not(.user-pitching) .batter{right:auto;left:-12%}
  .scene.v202-cinematic-bat:not(.user-pitching) .bat{right:-4%}
  .scene.v202-cinematic-bat.bat-left:not(.user-pitching) .bat{right:auto;left:-4%}
}
'''

if s.count('</style>') != 1:
    raise SystemExit(f'Expected one </style>, got {s.count("</style>")}')
s = s.replace('</style>', css + '\n</style>', 1)

# New installs default to the reference-style camera.
count = s.count("batView:'standard',pitchView:'catcher'")
if count != 2:
    raise SystemExit(f'Expected 2 v15 default view pairs, got {count}')
s = s.replace("batView:'standard',pitchView:'catcher'", "batView:'cinematic',pitchView:'cinematic'")

# Add explicit camera choices without removing old views.
old_bat = '<select id="v15BatView"><option value="standard">標準</option><option value="close">近距離</option><option value="broadcast">轉播</option></select>'
new_bat = '<select id="v15BatView"><option value="cinematic">實戰（影片風格）</option><option value="standard">標準</option><option value="close">近距離</option><option value="broadcast">轉播</option></select>'
old_pitch = '<select id="v15PitchView"><option value="catcher">捕手後方</option><option value="pitcher">投手後方</option></select>'
new_pitch = '<select id="v15PitchView"><option value="cinematic">實戰（投手丘）</option><option value="catcher">捕手後方</option><option value="pitcher">投手後方</option></select>'
for old,new,label in [(old_bat,new_bat,'bat view select'),(old_pitch,new_pitch,'pitch view select')]:
    if s.count(old) != 1:
        raise SystemExit(f'Expected one {label}, got {s.count(old)}')
    s = s.replace(old,new,1)

# Apply cinematic classes to both scene and game wrapper.
needle = "sc.classList.toggle('v15-pitch-behind',halfMode==='pitch'&&v15Prefs.pitchView==='pitcher');"
replacement = needle + "sc.classList.toggle('v202-cinematic-bat',halfMode==='bat'&&v15Prefs.batView==='cinematic');sc.classList.toggle('v202-cinematic-pitch',halfMode==='pitch'&&v15Prefs.pitchView==='cinematic');const v202Game=$('gameApp');if(v202Game){const v202Any=v15Prefs.batView==='cinematic'||v15Prefs.pitchView==='cinematic';v202Game.classList.toggle('v202-cinematic-game',v202Any);v202Game.classList.toggle('v202-mode-bat',halfMode==='bat'&&v15Prefs.batView==='cinematic');v202Game.classList.toggle('v202-mode-pitch',halfMode==='pitch'&&v15Prefs.pitchView==='cinematic')}"
if s.count(needle) != 1:
    raise SystemExit(f'Expected one v15 pitch view toggle, got {s.count(needle)}')
s = s.replace(needle,replacement,1)

# Let the existing true behind-pitcher ball path serve the new cinematic pitching camera too.
old_anim = "if(!(halfMode==='pitch'&&v15Prefs.pitchView==='pitcher'))return v15AnimatePitchBase(now);"
new_anim = "if(!(halfMode==='pitch'&&(v15Prefs.pitchView==='pitcher'||v15Prefs.pitchView==='cinematic')))return v15AnimatePitchBase(now);"
if s.count(old_anim) != 1:
    raise SystemExit(f'Expected one v15 alternate pitch animation condition, got {s.count(old_anim)}')
s = s.replace(old_anim,new_anim,1)

# One-time migration so existing devices actually switch to the requested camera instead of keeping saved old prefs.
lines = s.splitlines()
inserted = False
for i,line in enumerate(lines):
    if line.startswith('let v15Prefs=v15LoadPrefs()'):
        migration = "try{if(!localStorage.getItem('cpblFantasyCinematicViewV202')){v15Prefs.batView='cinematic';v15Prefs.pitchView='cinematic';v15SavePrefs();localStorage.setItem('cpblFantasyCinematicViewV202','1')}}catch{}"
        lines.insert(i+1,migration)
        inserted = True
        break
if not inserted:
    raise SystemExit('Could not find v15 prefs initialization for migration')
s = '\n'.join(lines) + ('\n' if s.endswith('\n') else '')

# Version bump.
version = Path('site-version.js')
v = version.read_text(encoding='utf-8')
if "const SITE_VERSION = 'v2.0.1'" not in v:
    raise SystemExit('Expected site version v2.0.1')
v = v.replace("const SITE_VERSION = 'v2.0.1'", "const SITE_VERSION = 'v2.0.2'", 1)

html.write_text(s, encoding='utf-8')
version.write_text(v, encoding='utf-8')
print('Installed v2.0.2 cinematic batting/pitching cameras')
