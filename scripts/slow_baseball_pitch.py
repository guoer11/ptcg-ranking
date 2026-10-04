from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')
old = "pitchDuration=clamp(1450-lastSpeed*4.2,760,1150);"
new = "pitchDuration=clamp((1450-lastSpeed*4.2)*1.45,1120,1600);"
if old not in text:
    raise SystemExit('Target pitch-duration formula not found; refusing to modify.')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Slowed opponent pitch travel time by ~45% with 1120–1600 ms bounds.')
