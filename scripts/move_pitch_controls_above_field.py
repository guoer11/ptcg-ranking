from pathlib import Path

p = Path('baseball-game.html')
s = p.read_text(encoding='utf-8')
panel = '    <div id="pitchModePanel" class="pitch-mode-panel hidden"><div class="pitch-mode-top"><strong id="userPitcherLabel">你的投手</strong><span id="cpuBatterLabel">對手打者</span></div><div id="pitchTypeButtons" class="pitch-types"></div><div class="pitch-help">先選球種 → 拖曳九宮格瞄準 → 按「投球！」</div></div>\n'
if s.count(panel) != 1:
    raise SystemExit(f'pitch panel occurrence mismatch: {s.count(panel)}')
s = s.replace(panel, '', 1)
needle = '  </header>\n\n  <main id="scene" class="scene">'
insert = '  </header>\n' + panel.replace('    <div', '  <div', 1) + '\n  <main id="scene" class="scene">'
if needle not in s:
    raise SystemExit('header/main anchor not found')
s = s.replace(needle, insert, 1)
# Make the top pitch strip compact and definitively non-overlaying.
s = s.replace('.pitch-mode-panel{position:relative;flex:0 0 auto;z-index:28;background:#071514;border-top:1px solid rgba(255,255,255,.14);border-bottom:1px solid rgba(255,255,255,.10);padding:8px 10px;box-shadow:0 -5px 18px #0005}', '.pitch-mode-panel{position:relative;flex:0 0 auto;z-index:28;background:#071514;border-bottom:1px solid rgba(255,255,255,.12);padding:6px 8px;box-shadow:0 4px 12px #0004}', 1)
s = s.replace('@media(max-width:620px){.pitch-mode-panel{padding:6px 8px}.pitch-mode-top{margin-bottom:5px}', '@media(max-width:620px){.pitch-mode-panel{padding:5px 7px}.pitch-mode-top{margin-bottom:4px}', 1)
p.write_text(s, encoding='utf-8')
print('moved pitch controls above field')
