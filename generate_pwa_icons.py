from pathlib import Path
import sys

from PIL import Image, ImageDraw

NAVY = (7, 31, 77)
NAVY_2 = (14, 57, 122)
GOLD = (239, 186, 68)
GOLD_LIGHT = (255, 225, 133)
CREAM = (250, 248, 239)
WHITE = (255, 255, 255)


def rounded_card(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size):
    scale = 3
    s = 512 * scale
    img = Image.new('RGB', (s, s), NAVY)
    d = ImageDraw.Draw(img)

    # subtle background glow
    for i in range(18, 0, -1):
        pad = int((28 + i * 5) * scale)
        tone = (
            min(255, NAVY[0] + i // 2),
            min(255, NAVY[1] + i),
            min(255, NAVY[2] + i * 2),
        )
        d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=120 * scale, fill=tone)

    # cards behind the trophy
    cards = [
        (60, 245, 230, 390, -12),
        (82, 220, 250, 365, -4),
        (103, 235, 272, 382, 7),
    ]
    for x1, y1, x2, y2, angle in cards:
        card = Image.new('RGBA', (220 * scale, 190 * scale), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded_card(cd, (18*scale, 18*scale, 198*scale, 170*scale), 18*scale, NAVY_2, GOLD, 8*scale)
        cd.polygon([
            (108*scale, 58*scale), (121*scale, 86*scale), (150*scale, 98*scale),
            (121*scale, 110*scale), (108*scale, 139*scale), (95*scale, 110*scale),
            (66*scale, 98*scale), (95*scale, 86*scale),
        ], fill=GOLD_LIGHT)
        card = card.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        img.paste(card, (int((x1-28)*scale), int((y1-42)*scale)), card)

    d = ImageDraw.Draw(img)

    # trophy handles
    d.arc((92*scale, 108*scale, 306*scale, 310*scale), 120, 250, fill=GOLD_LIGHT, width=22*scale)
    d.arc((206*scale, 108*scale, 420*scale, 310*scale), 290, 60, fill=GOLD_LIGHT, width=22*scale)

    # trophy cup
    cup = [(132, 118), (350, 118), (330, 270), (302, 308), (270, 328), (214, 328), (182, 308), (153, 270)]
    d.polygon([(x*scale, y*scale) for x, y in cup], fill=CREAM)
    d.rounded_rectangle((128*scale, 104*scale, 354*scale, 132*scale), radius=12*scale, fill=GOLD_LIGHT)
    d.rounded_rectangle((142*scale, 115*scale, 340*scale, 126*scale), radius=5*scale, fill=GOLD)

    # trophy sparkle
    d.polygon([(241*scale, 170*scale), (253*scale, 197*scale), (280*scale, 209*scale), (253*scale, 221*scale),
               (241*scale, 249*scale), (229*scale, 221*scale), (202*scale, 209*scale), (229*scale, 197*scale)], fill=GOLD)

    # trophy stem and base
    d.rounded_rectangle((218*scale, 322*scale, 265*scale, 350*scale), radius=10*scale, fill=GOLD_LIGHT)
    d.polygon([(220*scale, 346*scale), (263*scale, 346*scale), (282*scale, 390*scale), (201*scale, 390*scale)], fill=GOLD)
    d.rounded_rectangle((176*scale, 386*scale, 306*scale, 412*scale), radius=10*scale, fill=GOLD_LIGHT)
    d.rounded_rectangle((154*scale, 408*scale, 328*scale, 448*scale), radius=12*scale, fill=GOLD)

    # ranking bars
    bar_x = [336, 377, 418, 459]
    bar_h = [54, 86, 122, 164]
    for x, h in zip(bar_x, bar_h):
        d.rounded_rectangle((x*scale, (432-h)*scale, (x+28)*scale, 432*scale), radius=6*scale, fill=CREAM)

    # growth arrow
    pts = [(322, 360), (357, 344), (389, 321), (420, 285), (449, 246)]
    d.line([(x*scale, y*scale) for x, y in pts], fill=GOLD_LIGHT, width=12*scale, joint='curve')
    d.polygon([(449*scale, 246*scale), (424*scale, 253*scale), (444*scale, 272*scale)], fill=GOLD_LIGHT)

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    out_dir.mkdir(parents=True, exist_ok=True)
    draw_icon(180).save(out_dir / 'apple-touch-icon.png', optimize=True)
    draw_icon(192).save(out_dir / 'icon-192.png', optimize=True)
    draw_icon(512).save(out_dir / 'icon-512.png', optimize=True)


if __name__ == '__main__':
    main()
