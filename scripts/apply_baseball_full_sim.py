from pathlib import Path

PATH = Path('baseball-game.html')
text = PATH.read_text(encoding='utf-8')

if '/* ===== V6 full baseball systems ===== */' not in text:
    raise RuntimeError('V6 baseball system is missing; refusing cleanup')

changed = False
css_start = text.find('\n/* FULL_SIM_V3 */')
if css_start != -1:
    css_end = text.find('\n</style>', css_start)
    if css_end == -1:
        raise RuntimeError('Could not find end of V3 CSS')
    text = text[:css_start] + text[css_end:]
    changed = True

js_start = text.find('\n// FULL_SIM_V3')
if js_start != -1:
    js_end = text.find('\nloadPlayers();\n})();', js_start)
    if js_end == -1:
        raise RuntimeError('Could not find end of V3 JS')
    text = text[:js_start] + text[js_end:]
    changed = True

if 'FULL_SIM_V3' in text:
    raise RuntimeError('V3 marker still remains after cleanup')
if 'V6 full baseball systems' not in text:
    raise RuntimeError('V6 marker disappeared during cleanup')

if changed:
    PATH.write_text(text, encoding='utf-8')
    print('Removed duplicate FULL_SIM_V3 layer; V6 preserved')
else:
    print('V3 already absent; nothing to clean')
