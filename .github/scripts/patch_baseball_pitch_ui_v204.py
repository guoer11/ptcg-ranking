from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')
marker = '/* ===== V204 TOP PITCH SELECTOR ===== */'

css = r'''
/* ===== V204 TOP PITCH SELECTOR ===== */
/* Keep the compact scoreboard, but remove the extra upper info cards while pitching. */
#gameApp.v202-mode-pitch .hud,
#gameApp.v202-mode-pitch .batterCard{display:none!important}

/* Move pitch selection directly under the scoreboard. */
#gameApp.v202-mode-pitch .pitch-mode-panel{
  position:absolute!important;
  z-index:74!important;
  top:44px!important;
  bottom:auto!important;
  left:0!important;
  right:0!important;
  width:auto!important;
  margin:0!important;
  padding:5px 7px 6px!important;
  border:0!important;
  border-bottom:1px solid rgba(255,255,255,.18)!important;
  border-radius:0!important;
  background:linear-gradient(180deg,rgba(3,12,14,.92),rgba(4,15,17,.78))!important;
  box-shadow:0 5px 14px rgba(0,0,0,.28)!important;
  backdrop-filter:blur(7px)
}

/* Remove pitcher/batter text from the top strip; keep only the pitch-chart utility. */
#gameApp.v202-mode-pitch .pitch-mode-top{
  position:absolute;
  right:6px;
  top:6px;
  z-index:2;
  margin:0!important;
  display:block!important;
}
#gameApp.v202-mode-pitch #userPitcherLabel,
#gameApp.v202-mode-pitch #cpuBatterLabel{display:none!important}
#gameApp.v202-mode-pitch .pitch-chart-btn{
  width:34px;
  min-width:34px;
  height:32px;
  padding:0!important;
  overflow:hidden;
  color:transparent!important;
  font-size:0!important;
  border-radius:9px;
  background:rgba(16,47,49,.88)
}
#gameApp.v202-mode-pitch .pitch-chart-btn:after{
  content:'▦';
  color:#dce9e5;
  font-size:17px;
  line-height:30px
}

/* Ball types are now the primary top control. */
#gameApp.v202-mode-pitch .pitch-types{
  display:flex!important;
  gap:5px!important;
  padding:1px 42px 1px 0!important;
  overflow-x:auto!important;
  scroll-snap-type:x proximity;
  -webkit-overflow-scrolling:touch
}
#gameApp.v202-mode-pitch .pitch-type{
  flex:0 0 auto!important;
  min-width:66px!important;
  min-height:32px!important;
  padding:5px 7px!important;
  border-radius:10px!important;
  font-size:10px!important;
  scroll-snap-align:start
}
#gameApp.v202-mode-pitch .pitch-defense-actions{
  margin:4px 0 0!important;
  padding:0 42px 0 0!important;
}
#gameApp.v202-mode-pitch .pitch-help{display:none!important}

/* Weather can stay subtle, but no longer occupies the upper pitching HUD. */
#gameApp.v202-mode-pitch .v15-wind{display:none!important}

@media (orientation:landscape){
  #gameApp.v202-mode-pitch .pitch-mode-panel{top:36px!important;padding:4px 6px 5px!important}
  #gameApp.v202-mode-pitch .pitch-type{min-width:62px!important;min-height:30px!important;padding:4px 6px!important;font-size:9px!important}
  #gameApp.v202-mode-pitch .pitch-chart-btn{width:32px;min-width:32px;height:30px}
  #gameApp.v202-mode-pitch .pitch-chart-btn:after{font-size:16px;line-height:28px}
}

@media (orientation:portrait){
  #gameApp.v202-mode-pitch .pitch-mode-panel{top:44px!important}
  #gameApp.v202-mode-pitch .pitch-type{min-width:64px!important}
}
'''

if marker not in s:
    if '</style>' not in s:
        raise SystemExit('style end tag not found')
    s = s.replace('</style>', css + '\n</style>', 1)

path.write_text(s, encoding='utf-8')
print('patched baseball-game.html with V204 top pitch selector')
