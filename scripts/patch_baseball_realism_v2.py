from pathlib import Path
import base64
import gzip

root = Path("scripts")
data = "".join(
    (root / f".baseball_v6_{i:02d}").read_text(encoding="utf-8").strip()
    for i in range(7)
)
raw = gzip.decompress(base64.b64decode(data))
Path("baseball-game.html").write_bytes(raw)
print(f"Wrote complete baseball V6 ({len(raw)} bytes)")
