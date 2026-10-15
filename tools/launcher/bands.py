"""Abstract trade-heading backgrounds (drawn procedurally, no stock imagery).
structural: blue/teal diagonal textured bands with bevelled joints.
geotechnical: dark brown field with glowing amber hexagons (bokeh)."""
import math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def vnoise(h, w, cells, seed):
    r = np.random.default_rng(seed).random((cells + 2, int(cells * w / h) + 2))
    ys = np.linspace(0, cells, h, endpoint=False); xs = np.linspace(0, cells * w / h, w, endpoint=False)
    yi, xi = ys.astype(int), xs.astype(int); fy, fx = ys - yi, xs - xi
    fy = (fy * fy * (3 - 2 * fy))[:, None]; fx = (fx * fx * (3 - 2 * fx))[None, :]
    a = r[np.ix_(yi, xi)]; b = r[np.ix_(yi, xi + 1)]; c = r[np.ix_(yi + 1, xi)]; d = r[np.ix_(yi + 1, xi + 1)]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, seed):
    t = sum(a * vnoise(h, w, c, seed + k) for k, (c, a) in enumerate([(2, .5), (6, .25), (18, .15), (60, .1)]))
    return (t - t.mean()) / t.std()


def structural(W=1600, H=200, seed=3):
    cols = [(0.22, 0.52, 0.66), (0.13, 0.42, 0.62), (0.40, 0.58, 0.60), (0.12, 0.55, 0.62), (0.15, 0.40, 0.58), (0.08, 0.26, 0.42), (0.20, 0.47, 0.65), (0.06, 0.20, 0.34)]
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    u = (xx + yy * 1.05)                      # diagonal coordinate (~45 deg)
    widths = np.array([150, 230, 120, 260, 170, 300, 140, 400, 200, 260])
    edges = np.cumsum(np.concatenate([[0], np.tile(widths, 3)]))
    idx = np.searchsorted(edges, u, side='right') - 1
    img = np.zeros((H, W, 3))
    for k in range(idx.max() + 1):
        m = idx == k
        img[m] = cols[k % len(cols)]
    t = fbm(H, W, seed)[..., None]
    img *= 1 + 0.09 * t
    # bevelled joints: dark line + highlight just after each edge
    dist = u - edges[idx]
    img *= (1 - 0.45 * np.exp(-(dist / 2.2) ** 2))[..., None]
    img *= (1 + 0.10 * np.exp(-((dist - 5) / 3) ** 2))[..., None]
    # concrete pores
    rng = np.random.default_rng(seed)
    pores = rng.random((H, W)) > 0.9975
    img[pores] *= 0.6
    img[rng.random((H, W)) > 0.996] *= 1.25
    # darken right side so the text on the left stays legible against a calm field
    img *= (1 - 0.35 * (xx / W) ** 1.5)[..., None]
    img *= (0.80 + 0.2 * (1 - yy / H))[..., None]
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))


def hexagon(cx, cy, r):
    return [(cx + r * math.cos(math.pi / 6 + k * math.pi / 3), cy + r * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]


def geotechnical(W=1600, H=200, seed=7):
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    base = np.dstack([0.24 - 0.18 * (xx / W), 0.14 - 0.11 * (xx / W), 0.06 - 0.05 * (xx / W)])
    base *= (1 + 0.15 * fbm(H, W, seed))[..., None]
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    rng = np.random.default_rng(seed)
    r = 34; dx = r * math.sqrt(3); dy = r * 1.5
    for layer, (blur, alpha_k, scale) in enumerate([(6, 0.55, 1.35), (0, 1.0, 1.0)]):
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for row in range(-1, int(H / dy) + 2):
            for col in range(-1, int(W / dx) + 2):
                cx = col * dx + (row % 2) * dx / 2 + (layer * 21); cy = row * dy + layer * 13
                fade = max(0.0, 1 - (max(cx, 0.0) / (W * 0.95)) ** 1.6)          # glow strongest on the left
                if rng.random() > 0.55 + 0.35 * (1 - fade): continue
                a = int(255 * alpha_k * fade * rng.uniform(0.15, 0.75))
                warm = rng.uniform(0.7, 1.0)
                fill = (int(235 * warm), int(170 * warm), int(105 * warm), a)
                rr = r * scale * rng.uniform(0.82, 0.98)
                d.polygon(hexagon(cx, cy, rr), fill=fill)
                d.polygon(hexagon(cx, cy, rr * 0.62), fill=(255, 225, 175, int(a * 0.35)))
                d.line(hexagon(cx, cy, rr) + [hexagon(cx, cy, rr)[0]], fill=(255, 210, 150, min(255, int(a * 1.2))), width=1)
        if blur: lay = lay.filter(ImageFilter.GaussianBlur(blur))
        img = Image.alpha_composite(img, lay)
    return img.convert('RGB')


if __name__ == '__main__':
    out = sys.argv[1]
    structural().save(f'{out}/band-structural.jpg', quality=88)
    geotechnical().save(f'{out}/band-geotechnical.jpg', quality=88)
    print('ok')
