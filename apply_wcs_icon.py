#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
from collections import deque
from PIL import Image


def prepare_icon(src_path='/tmp/wcs2026icon.png', out_path='assets/q-icons/wcs2026icon.webp'):
    src = Image.open(src_path).convert('RGBA')
    px = src.load()
    w, h = src.size
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]

    def close_to_corner(rgb):
        return any(sum((int(rgb[i]) - int(c[i])) ** 2 for i in range(3)) <= 28 ** 2 for c in corners)

    seen = set()
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y][3] and close_to_corner(px[x, y][:3]):
                seen.add((x, y)); q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y][3] and close_to_corner(px[x, y][:3]) and (x, y) not in seen:
                seen.add((x, y)); q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < w and 0 <= yy < h and (xx, yy) not in seen:
                if px[xx, yy][3] and close_to_corner(px[xx, yy][:3]):
                    seen.add((xx, yy)); q.append((xx, yy))

    for x, y in seen:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)

    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    src.save(out, 'WEBP', lossless=True, quality=100, method=6)
    print('WCS icon saved:', src.size, '->', out)


def patch_ui():
    js_path = Path('ranking-season-ui.js')
    js = js_path.read_text(encoding='utf-8')
    old = """function worldsIconHtml(label = '2025-2026 世界賽選手') {
  return `<span class=\"wcs-player-icon\" title=\"${esc(label)}\" aria-label=\"${esc(label)}\" role=\"img\">
    <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">
      <circle cx=\"12\" cy=\"12\" r=\"9\"></circle>
      <path d=\"M3.5 12h17M12 3c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21M12 3C9.5 5.4 8.2 8.4 8.2 12S9.5 18.6 12 21\"></path>
    </svg>
  </span>`;
}"""
    new = """function worldsIconHtml(label = '2025-2026 世界賽選手') {
  return `<span class=\"wcs-player-icon\" title=\"${esc(label)}\" aria-label=\"${esc(label)}\" role=\"img\">
    <img src=\"assets/q-icons/wcs2026icon.webp?v=2026\" alt=\"\" aria-hidden=\"true\" />
  </span>`;
}"""
    if old not in js:
        raise RuntimeError('找不到 worldsIconHtml 原始內容，停止修改')
    js_path.write_text(js.replace(old, new, 1), encoding='utf-8')

    css_path = Path('ranking-season-ui.css')
    css = css_path.read_text(encoding='utf-8')
    marker = '/* v2.1.0 refinement: official WCS 2026 logo */'
    if marker not in css:
        css += """

/* v2.1.0 refinement: official WCS 2026 logo */
.wcs-player-icon {
  width: 28px;
  height: 32px;
  flex: 0 0 28px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.wcs-player-icon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.prior-worlds-label .wcs-player-icon {
  width: 28px;
  height: 32px;
  flex-basis: 28px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

@media (max-width: 620px) {
  .wcs-player-icon {
    width: 24px;
    height: 28px;
    flex-basis: 24px;
  }
  .prior-worlds-label .wcs-player-icon {
    width: 26px;
    height: 30px;
    flex-basis: 26px;
  }
}
"""
        css_path.write_text(css, encoding='utf-8')

    index_path = Path('index.html')
    index = index_path.read_text(encoding='utf-8')
    index = index.replace('ranking-season-ui.css?v=2.1.0-r1', 'ranking-season-ui.css?v=2.1.0-r2')
    index = index.replace('ranking-season-ui.js?v=2.1.0-r1', 'ranking-season-ui.js?v=2.1.0-r2')
    index_path.write_text(index, encoding='utf-8')


if __name__ == '__main__':
    prepare_icon()
    patch_ui()
