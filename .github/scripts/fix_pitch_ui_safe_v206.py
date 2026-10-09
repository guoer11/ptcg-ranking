from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')
marker = '/* ===== V206 SAFE PITCH SELECTOR ===== */'
if marker not in s:
    insert = r'''

/* ===== V206 SAFE PITCH SELECTOR ===== */
/* Keep pitch controls in normal flex flow so iPhone safe-area/status bar can never cover them. */
#gameApp.pitch-ui-top .pitch-mode-panel{
  position:relative!important;
  top:auto!important;
  bottom:auto!important;
  left:auto!important;
  right:auto!important;
  width:100%!important;
  flex:0 0 auto!important;
  z-index:31!important;
  margin:0!important;
  padding:6px 7px 7px!important;
  border:0!important;
  border-bottom:1px solid rgba(255,255,255,.18)!important;
  border-radius:0!important;
  background:linear-gradient(180deg,rgba(3,12,14,.98),rgba(4,15,17,.94))!important;
  box-shadow:0 4px 10px rgba(0,0,0,.28)!important;
  pointer-events:auto!important;
  touch-action:pan-x!important;
}
#gameApp.pitch-ui-top .pitch-mode-top{
  position:absolute!important;
  right:6px!important;
  top:6px!important;
  width:34px!important;
  height:40px!important;
  min-height:40px!important;
  margin:0!important;
  pointer-events:none!important;
}
#gameApp.pitch-ui-top .pitch-chart-btn{
  position:absolute!important;
  right:0!important;
  top:0!important;
  width:34px!important;
  min-width:34px!important;
  height:40px!important;
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#gameApp.pitch-ui-top .pitch-types{
  min-height:42px!important;
  align-items:center!important;
  gap:6px!important;
  padding:0 42px 0 0!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  pointer-events:auto!important;
  touch-action:pan-x!important;
}
#gameApp.pitch-ui-top .pitch-type{
  min-width:70px!important;
  min-height:40px!important;
  padding:7px 9px!important;
  font-size:11px!important;
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#gameApp.pitch-ui-top .pitch-defense-actions{
  margin:4px 0 0!important;
  padding:0 42px 0 0!important;
}
@media (orientation:landscape){
  #gameApp.pitch-ui-top .pitch-mode-panel{padding:4px 6px 5px!important}
  #gameApp.pitch-ui-top .pitch-mode-top{top:4px!important;height:36px!important;min-height:36px!important}
  #gameApp.pitch-ui-top .pitch-chart-btn{height:36px!important}
  #gameApp.pitch-ui-top .pitch-types{min-height:38px!important}
  #gameApp.pitch-ui-top .pitch-type{min-width:66px!important;min-height:36px!important;padding:5px 7px!important;font-size:10px!important}
}
'''
    s = s.replace('\n</style>', insert + '\n</style>', 1)
    path.write_text(s, encoding='utf-8')
