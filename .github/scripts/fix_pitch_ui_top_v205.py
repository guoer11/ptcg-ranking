from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')

# Re-target the V204 rules so they apply to every pitching camera, not only cinematic mode.
s = s.replace('#gameApp.v202-mode-pitch .hud,\n#gameApp.v202-mode-pitch .batterCard{display:none!important}', '#gameApp.pitch-ui-top .hud,\n#gameApp.pitch-ui-top .batterCard{display:none!important}')
s = s.replace('#gameApp.v202-mode-pitch .pitch-mode-panel{', '#gameApp.pitch-ui-top .pitch-mode-panel{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-mode-top{', '#gameApp.pitch-ui-top .pitch-mode-top{')
s = s.replace('#gameApp.v202-mode-pitch #userPitcherLabel,\n#gameApp.v202-mode-pitch #cpuBatterLabel{display:none!important}', '#gameApp.pitch-ui-top #userPitcherLabel,\n#gameApp.pitch-ui-top #cpuBatterLabel{display:none!important}')
s = s.replace('#gameApp.v202-mode-pitch .pitch-chart-btn{', '#gameApp.pitch-ui-top .pitch-chart-btn{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-chart-btn:after{', '#gameApp.pitch-ui-top .pitch-chart-btn:after{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-types{', '#gameApp.pitch-ui-top .pitch-types{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-type{', '#gameApp.pitch-ui-top .pitch-type{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-defense-actions{', '#gameApp.pitch-ui-top .pitch-defense-actions{')
s = s.replace('#gameApp.v202-mode-pitch .pitch-help{display:none!important}', '#gameApp.pitch-ui-top .pitch-help{display:none!important}')
s = s.replace('#gameApp.v202-mode-pitch .v15-wind{display:none!important}', '#gameApp.pitch-ui-top .v15-wind{display:none!important}')

# Make the top strip visibly cleaner: no pitcher/batter info row. Keep chart as a compact edge utility.
extra = '''\n/* V205: generic pitching-mode hook so every camera gets the same top pitch selector. */\n#gameApp.pitch-ui-top .pitch-mode-panel{top:58px!important}\n#gameApp.pitch-ui-top .pitch-mode-top{height:0!important;min-height:0!important;pointer-events:none}\n#gameApp.pitch-ui-top .pitch-chart-btn{position:absolute;right:6px;top:5px;pointer-events:auto}\n#gameApp.pitch-ui-top .pitch-types{min-height:36px;align-items:center}\n@media (orientation:landscape){#gameApp.pitch-ui-top .pitch-mode-panel{top:36px!important}}\n@media (orientation:portrait){#gameApp.pitch-ui-top .pitch-mode-panel{top:58px!important}}\n'''
marker = '</style>'
if 'V205: generic pitching-mode hook' not in s:
    s = s.replace(marker, extra + '\n' + marker, 1)

old = "function setHalfMode(mode){halfMode=mode;const pitch=mode==='pitch';$('scene').classList.toggle('user-pitching',pitch);$('pitchModePanel').classList.toggle('hidden',!pitch);"
new = "function setHalfMode(mode){halfMode=mode;const pitch=mode==='pitch';$('gameApp').classList.toggle('pitch-ui-top',pitch);$('scene').classList.toggle('user-pitching',pitch);$('pitchModePanel').classList.toggle('hidden',!pitch);"
if old not in s:
    raise SystemExit('setHalfMode target not found')
s = s.replace(old, new, 1)

path.write_text(s, encoding='utf-8')
