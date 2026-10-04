from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')
old = "pitchDuration=clamp((1450-lastSpeed*4.2)*1.45,1120,1600);"
new = "pitchDuration=clamp((1450-lastSpeed*4.2)*1.75,1350,1900);"
if old not in text:
    raise SystemExit('Current slowed pitch-duration formula not found; refusing to modify.')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Slowed opponent pitch travel time further: 1350–1900 ms bounds.')
