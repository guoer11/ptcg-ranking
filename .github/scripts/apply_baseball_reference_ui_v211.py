from pathlib import Path

path = Path('baseball-game.html')
s = path.read_text(encoding='utf-8')
link = '<link rel="stylesheet" href="baseball-reference-ui.css?v=211">'
if link in s:
    print('reference UI link already present')
    raise SystemExit(0)
if '</head>' not in s:
    raise SystemExit('head end not found')
s = s.replace('</head>', link + '\n</head>', 1)
path.write_text(s, encoding='utf-8')
print('reference UI linked')
