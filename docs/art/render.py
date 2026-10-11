"""Renders the 'Luminous Inquiry' plate (docs/art/luminous-inquiry.png). Needs pillow + numpy.

    python docs/art/render.py <fonts_dir>
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(sys.argv[1])
OUT = Path(__file__).with_name("luminous-inquiry.png")
W, H, S = 1920, 1080, 2  # S = supersampling factor
w, h = W * S, H * S

INK = (236, 232, 222)
AMBER = (255, 196, 110)
NODES = ["CLASSIFY", "RETRIEVE", "CALL_TOOLS", "ANALYZE", "DECIDE", "APPROVAL", "EXECUTE", "VERIFY", "REPORT"]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * S)


# ---------- light field (numpy, float) ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
field = np.zeros((H, W, 3), np.float32)
field += np.array([5, 5, 8], np.float32)  # near-black base, slightly cool


def bloom(cx, cy, rx, ry, color, strength):
    g = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
    field[...] += g[..., None] * np.array(color, np.float32) * strength


bloom(1500, 120, 620, 300, (124, 58, 237), 0.55)   # violet
bloom(1700, 420, 520, 260, (14, 165, 233), 0.42)   # sky
bloom(1180, 330, 700, 220, (234, 179, 8), 0.20)    # amber, low and wide
bloom(380, 980, 520, 220, (88, 28, 135), 0.22)     # faint violet echo bottom-left
# fine grain
rng = np.random.default_rng(7)
field += rng.normal(0, 2.2, (H, W, 1)).astype(np.float32)
base = Image.fromarray(np.clip(field, 0, 255).astype(np.uint8), "RGB").resize((w, h), Image.LANCZOS)

layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

# ---------- dot lattice ----------
step = 32 * S
for y in range(step, h - step // 2, step):
    for x in range(step, w - step // 2, step):
        d.ellipse([x - S, y - S, x + S, y + S], fill=INK + (26,))

# ---------- arc of nodes ----------
# Points on an ascending curve from lower-left to upper-right.
def curve(t: float) -> tuple[float, float]:
    x = 250 + t * 1420
    y = 820 - 520 * (t ** 1.35) + 70 * math.sin(t * math.pi * 1.6)
    return x * S, y * S


ts = [i / (len(NODES) - 1) for i in range(len(NODES))]
pts = [curve(t) for t in ts]

# trajectory: hairline with ticks
samples = [curve(i / 900) for i in range(901)]
d.line(samples, fill=INK + (120,), width=1 * S)
for i in range(0, 901, 9):
    x0, y0 = samples[i]
    x1, y1 = samples[min(i + 1, 900)]
    ang = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    L = (7 if i % 45 == 0 else 3) * S
    d.line([(x0, y0), (x0 + L * math.cos(ang), y0 + L * math.sin(ang))], fill=INK + (90,), width=1 * S)

# loop-back orbit around CALL_TOOLS (the agent returns here for more evidence)
cx, cy = pts[2]
for r, a in [(46, 70), (58, 40)]:
    d.arc([cx - r * S, cy - r * S, cx + r * S, cy + r * S], start=200, end=520, fill=INK + (a,), width=1 * S)
# arrow head on the loop
ah = math.radians(160)
ax, ay = cx + 58 * S * math.cos(ah), cy + 58 * S * math.sin(ah)
d.polygon([(ax, ay), (ax - 6 * S, ay - 9 * S), (ax + 6 * S, ay - 7 * S)], fill=INK + (90,))

label_f = font("GeistMono-Regular.ttf", 11)
coord_f = font("GeistMono-Regular.ttf", 9)
num_f = font("Jura-Light.ttf", 13)

for i, ((x, y), name) in enumerate(zip(pts, NODES)):
    warm = name == "APPROVAL"
    col = AMBER if warm else INK
    # concentric instrument rings
    for k, (r, a) in enumerate([(5, 255), (12, 170), (22, 70), (34, 34)]):
        rr = r * S
        if k == 0:
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col + (a,))
        else:
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=col + (a,), width=1 * S)
    # crosshair
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        d.line([(x + dx * 40 * S, y + dy * 40 * S), (x + dx * 48 * S, y + dy * 48 * S)], fill=col + (110,), width=1 * S)
    if warm:  # the threshold: a human gate, two parallel bars
        for off in (-56, 56):
            d.line([(x + off * S, y - 30 * S), (x + off * S, y + 30 * S)], fill=AMBER + (200,), width=2 * S)
    # labels: alternate above/below the curve to keep breathing room
    above = i % 2 == 0
    ly = y + ((-112 if i == 2 else -78) if above else 62) * S
    d.text((x, ly), f"{i + 1:02d}", font=num_f, fill=col + (150,), anchor="mm")
    d.text((x, ly + (16 if above else 16) * S), name, font=label_f, fill=col + (235 if warm else 210,), anchor="mm")
    d.text((x, ly + 31 * S), f"{x / S:06.1f} · {y / S:05.1f}", font=coord_f, fill=INK + (80,), anchor="mm")

# ---------- plate frame & annotations ----------
m = 56 * S
d.line([(m, m), (m + 28 * S, m)], fill=INK + (120,), width=1 * S)
d.line([(m, m), (m, m + 28 * S)], fill=INK + (120,), width=1 * S)
d.line([(w - m, h - m), (w - m - 28 * S, h - m)], fill=INK + (120,), width=1 * S)
d.line([(w - m, h - m), (w - m, h - m - 28 * S)], fill=INK + (120,), width=1 * S)

title_f = font("InstrumentSerif-Italic.ttf", 30)
small_f = font("GeistMono-Regular.ttf", 10)
d.text((m + 6 * S, m + 44 * S), "fig. 01, anatomy of an inquiry", font=title_f, fill=INK + (225,))
d.text((m + 6 * S, m + 88 * S), "NINE STATES · ONE RETURN ORBIT · ONE HUMAN THRESHOLD", font=small_f, fill=INK + (110,))
d.text((w - m - 16 * S, h - m - 52 * S), "OPSPILOT / PLATE I", font=small_f, fill=INK + (120,), anchor="rs")
d.text((w - m - 16 * S, h - m - 30 * S), "evidence before action", font=font("InstrumentSerif-Italic.ttf", 15), fill=INK + (150,), anchor="rs")

# scale bar, bottom-left
sx, sy = m + 6 * S, h - m - 30 * S
d.line([(sx, sy), (sx + 200 * S, sy)], fill=INK + (120,), width=1 * S)
for j in range(0, 201, 25):
    tl = (6 if j % 100 == 0 else 3) * S
    d.line([(sx + j * S, sy), (sx + j * S, sy - tl)], fill=INK + (120,), width=1 * S)
d.text((sx, sy + 8 * S), "0", font=coord_f, fill=INK + (100,))
d.text((sx + 200 * S, sy + 8 * S), "≤ 6 steps", font=coord_f, fill=INK + (100,), anchor="ra")

# soft glow under the instruments
glow = layer.filter(ImageFilter.GaussianBlur(6 * S))
out = Image.alpha_composite(base.convert("RGBA"), glow)
out = Image.alpha_composite(out, layer)
out.resize((W, H), Image.LANCZOS).convert("RGB").save(OUT, optimize=True)
print("wrote", OUT)
