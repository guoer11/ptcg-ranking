from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')
marker = '/* ===== V207 IN-SCENE PITCH SELECTOR ===== */'
if marker in s:
    print('v207 already applied')
    raise SystemExit(0)

needle = "function setHalfMode(mode){halfMode=mode;const pitch=mode==='pitch';"
if needle not in s:
    raise SystemExit('setHalfMode hook not found')
s = s.replace(
    needle,
    needle + "const sc=$('scene'),pp=$('pitchModePanel');if(pitch&&sc&&pp&&pp.parentElement!==sc)sc.appendChild(pp);",
    1,
)

css = r'''

/* ===== V207 IN-SCENE PITCH SELECTOR ===== */
/* Put the pitch selector inside the field itself, safely below the scoreboard/status area. */
#gameApp.pitch-ui-top #scene > .pitch-mode-panel{
  position:absolute!important;
  top:86px!important;
  bottom:auto!important;
  left:10px!important;
  right:10px!important;
  width:auto!important;
  margin:0!important;
  z-index:86!important;
  padding:7px 8px 8px!important;
  border:1px solid rgba(255,255,255,.22)!important;
  border-radius:14px!important;
  background:linear-gradient(180deg,rgba(3,14,16,.94),rgba(5,20,22,.90))!important;
  box-shadow:0 7px 20px rgba(0,0,0,.30)!important;
  backdrop-filter:blur(8px)!important;
  pointer-events:auto!important;
  touch-action:pan-x!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-mode-top{
  position:absolute!important;
  right:7px!important;
  top:7px!important;
  width:40px!important;
  height:44px!important;
  min-height:44px!important;
  margin:0!important;
  pointer-events:none!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel #userPitcherLabel,
#gameApp.pitch-ui-top #scene > .pitch-mode-panel #cpuBatterLabel{display:none!important}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-chart-btn{
  position:absolute!important;
  right:0!important;
  top:0!important;
  width:40px!important;
  min-width:40px!important;
  height:42px!important;
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-types{
  display:flex!important;
  min-height:44px!important;
  align-items:center!important;
  gap:7px!important;
  padding:0 48px 0 0!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  scrollbar-width:none!important;
  -webkit-overflow-scrolling:touch!important;
  pointer-events:auto!important;
  touch-action:pan-x!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-types::-webkit-scrollbar{display:none!important}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-type{
  flex:0 0 auto!important;
  min-width:76px!important;
  min-height:42px!important;
  padding:7px 9px!important;
  font-size:11px!important;
  border-radius:11px!important;
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-defense-actions{
  margin:5px 0 0!important;
  padding:0!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-help{display:none!important}

@media (orientation:portrait){
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel{top:92px!important;left:9px!important;right:9px!important}
}
@media (orientation:landscape){
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel{top:44px!important;left:10px!important;right:10px!important;padding:5px 7px 6px!important}
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-type{min-height:36px!important;min-width:68px!important;padding:5px 7px!important;font-size:10px!important}
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-types{min-height:38px!important}
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel .pitch-chart-btn{height:36px!important}
}
'''

if '</style>' not in s:
    raise SystemExit('style end not found')
s = s.replace('</style>', css + '\n</style>', 1)
path.write_text(s, encoding='utf-8')
print('applied v207')
