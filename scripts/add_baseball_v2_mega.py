from pathlib import Path
import re,base64,zlib
p=Path('baseball-game.html')
s=p.read_text()
if 'V20 MEGA BASEBALL' in s:
    raise SystemExit('v2 already installed')
if 'V15 IMMERSIVE BASEBALL' not in s:
    raise SystemExit('v15 base not found')
parts=[Path(f'scripts/v20_block_{i}.txt').read_text().strip() for i in range(1,5)]
block=zlib.decompress(base64.b64decode(''.join(parts))).decode()
idx=s.rfind('\n})();')
if idx<0:
    raise SystemExit('IIFE close not found')
s=s[:idx]+'\n'+block+'\n'+s[idx:]
p.write_text(s)
vp=Path('site-version.js')
v=vp.read_text()
if not re.search(r"const SITE_VERSION = 'v\d+\.\d+\.\d+'",v):
    raise SystemExit('site version not found')
v=re.sub(r"const SITE_VERSION = 'v\d+\.\d+\.\d+'","const SITE_VERSION = 'v2.0.0'",v,count=1)
vp.write_text(v)
