"""Render every module icon and write apps/web/public/icons/<slug>.webp (256 px, transparent).

Usage (from repo root):  python3 tools/icons/export.py [slug ...]
Requires: Python 3.10+, numpy, Pillow.  Output is deterministic (seeded textures)."""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icons import ICONS  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'public', 'icons')
SIDE = 256          # exported tile, displayed at 84-120 px (2x for high-DPI screens)
RENDER = 384        # render size before normalising


def normalise(im):
    """Crop to content and scale every icon to the same visual weight (geometric mean of its size)."""
    a = np.array(im)[..., 3]
    ys, xs = np.nonzero(a > 40)                      # solid content
    w, h = xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min()
    ys2, xs2 = np.nonzero(a > 3)                     # content + soft shadow
    x0, x1, y0, y1 = xs2.min(), xs2.max() + 1, ys2.min(), ys2.max() + 1
    s = min(0.80 * SIDE / math.sqrt(w * h), 0.97 * SIDE / max(w, h), 0.99 * SIDE / max(x1 - x0, y1 - y0))
    crop = im.crop((x0, y0, x1, y1)).resize((max(1, int((x1 - x0) * s)), max(1, int((y1 - y0) * s))), Image.LANCZOS)
    tile = Image.new('RGBA', (SIDE, SIDE), (0, 0, 0, 0))
    tile.paste(crop, ((SIDE - crop.width) // 2, (SIDE - crop.height) // 2))
    return tile


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for slug in sys.argv[1:] or list(ICONS):
        normalise(ICONS[slug]().image(RENDER)).save(os.path.join(OUT, f'{slug}.webp'), 'WEBP', quality=88, method=6)
        print('wrote', slug)
