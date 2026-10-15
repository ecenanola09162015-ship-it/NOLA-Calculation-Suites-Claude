"""Ñola textured isometric icon engine (numpy + PIL). Deterministic: same input -> same image.
Materials are procedural textures; geometry is boxes, prisms, cylinders, cones, polygons."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

K = math.cos(math.pi / 6)
TEXN = 512
TPU = 34            # texels per model unit
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


# ---------------------------------------------------------------- textures
def _vnoise(n, cells, seed):
    r = np.random.default_rng(seed).random((cells + 1, cells + 1))
    r[-1, :] = r[0, :]; r[:, -1] = r[:, 0]
    x = np.linspace(0, cells, n, endpoint=False)
    i = x.astype(int); f = x - i; f = f * f * (3 - 2 * f)
    a = r[np.ix_(i, i)]; b = r[np.ix_(i, i + 1)]; c = r[np.ix_(i + 1, i)]; d = r[np.ix_(i + 1, i + 1)]
    fx = f[None, :]; fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def _fbm(seed, octs):
    t = np.zeros((TEXN, TEXN))
    for k, (cells, amp) in enumerate(octs):
        t += amp * _vnoise(TEXN, cells, seed * 17 + k)
    return (t - t.mean()) / (t.std() + 1e-9)


def _grains(img, rng, count, rmin, rmax, base, var, shade=True):
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.integers(0, TEXN, 2); r = rng.uniform(rmin, rmax)
        f = rng.uniform(1 - var, 1 + var)
        col = tuple(int(np.clip(c * f, 0, 1) * 255) for c in base)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        if shade and r > 1.6:
            hl = tuple(int(np.clip(c * f * 1.22, 0, 1) * 255) for c in base)
            d.ellipse([x - r * 0.55, y - r * 0.6, x - r * 0.05, y - r * 0.1], fill=hl)


def _concrete(seed=1):
    t = _fbm(seed, [(3, .5), (8, .3), (24, .18), (80, .1), (220, .06)])
    blot = _fbm(seed + 3, [(5, 1)])
    alb = 0.74 + 0.05 * t - 0.035 * np.clip(blot - 0.6, 0, None)
    rng = np.random.default_rng(seed)
    sp = rng.random((TEXN, TEXN)); alb -= 0.09 * (sp > 0.994); alb += 0.05 * (sp < 0.004)
    yy, xx = np.mgrid[0:TEXN, 0:TEXN]
    for _ in range(int(TEXN * TEXN / 2600)):       # bug holes
        cx, cy, rad = rng.integers(0, TEXN), rng.integers(0, TEXN), rng.uniform(1.0, 2.8)
        x0, x1, y0, y1 = max(cx - 5, 0), min(cx + 6, TEXN), max(cy - 5, 0), min(cy + 6, TEXN)
        dd = np.hypot(xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy)
        alb[y0:y1, x0:x1] -= 0.36 * np.clip(1 - dd / rad, 0, 1) ** 0.6
    alb = np.clip(alb, 0, 1)
    return np.dstack([alb * 1.0, alb * 1.0, alb * 0.985])


def _soil(base, seed, grains=1.0, pebbles=0, gsize=(0.8, 2.2), var=0.28):
    t = _fbm(seed, [(4, .5), (16, .3), (60, .2)])
    img = np.clip(np.array(base)[None, None, :] * (1 + 0.07 * t[..., None]), 0, 1)
    im = Image.fromarray((img * 255).astype(np.uint8))
    rng = np.random.default_rng(seed)
    _grains(im, rng, int(9000 * grains), gsize[0], gsize[1], base, var, shade=False)
    if pebbles:
        peb = tuple(np.clip(np.array(base) * 0.6 + 0.25, 0, 1))
        _grains(im, rng, pebbles, 3.0, 7.0, peb, 0.22, shade=True)
    return np.asarray(im).astype(float) / 255


def _steel(base, seed, streak=0.04):
    t = _fbm(seed, [(6, .6), (40, .4)])
    s = _vnoise(TEXN, 200, seed + 9)[:, :1].repeat(TEXN, 1)          # brushed streaks
    img = np.array(base)[None, None, :] * (1 + 0.025 * t[..., None] + streak * (s[..., None] - 0.5))
    return np.clip(img, 0, 1)


def _flat(base, seed, amp=0.03):
    t = _fbm(seed, [(8, 1)])
    return np.clip(np.array(base)[None, None, :] * (1 + amp * t[..., None]), 0, 1)


SOILC = {
    'topsoil': (0.40, 0.29, 0.20), 'clay': (0.66, 0.43, 0.30), 'silt': (0.74, 0.62, 0.46),
    'sand': (0.87, 0.75, 0.52), 'dsand': (0.74, 0.62, 0.42), 'gravel': (0.60, 0.58, 0.54),
    'satsand': (0.62, 0.68, 0.70),
}
MAT = {}


def materials():
    if MAT: return MAT
    MAT['concrete'] = _concrete(1)
    MAT['topsoil'] = _soil(SOILC['topsoil'], 11, grains=1.2, pebbles=40)
    MAT['clay'] = _soil(SOILC['clay'], 12, grains=0.5, gsize=(0.6, 1.4), var=0.15)
    MAT['silt'] = _soil(SOILC['silt'], 13, grains=0.9, gsize=(0.6, 1.6))
    MAT['sand'] = _soil(SOILC['sand'], 14, grains=1.6, gsize=(0.8, 2.0), var=0.22)
    MAT['dsand'] = _soil(SOILC['dsand'], 15, grains=1.4, gsize=(0.8, 2.0), pebbles=60)
    MAT['gravel'] = _soil(SOILC['gravel'], 16, grains=0.6, pebbles=420)
    MAT['satsand'] = _soil(SOILC['satsand'], 17, grains=2.4, gsize=(1.2, 3.0), var=0.3)
    MAT['steel'] = _steel((0.32, 0.50, 0.74), 21)
    MAT['steel_hi'] = _steel((0.16, 0.45, 0.88), 22)
    MAT['galv'] = _steel((0.70, 0.73, 0.76), 23, 0.06)
    MAT['steel_dark'] = _steel((0.36, 0.40, 0.45), 24)
    MAT['muted'] = _steel((0.78, 0.80, 0.82), 25, 0.02)
    MAT['brass'] = _steel((0.86, 0.64, 0.20), 26)
    MAT['cladding'] = _flat((0.84, 0.87, 0.90), 27)
    MAT['roof'] = _flat((0.42, 0.52, 0.62), 28)
    MAT['door'] = _flat((0.50, 0.56, 0.62), 29)
    MAT['orange'] = _flat((0.96, 0.52, 0.16), 30, 0.02)
    MAT['orange2'] = _flat((0.88, 0.30, 0.13), 33, 0.02)
    MAT['water'] = _flat((0.30, 0.62, 0.86), 31, 0.05)
    MAT['rock'] = _soil((0.56, 0.55, 0.53), 32, grains=1.0, gsize=(0.6, 1.8), var=0.35)
    return MAT


def light(n):
    n = np.asarray(n, float); n = n / np.linalg.norm(n)
    px, py, pz = (max(v, 0) for v in n)
    return 0.72 * px * px + 0.88 * py * py + 1.0 * pz * pz + 0.55 * max(0.0, 1 - px * px - py * py - pz * pz)


# ---------------------------------------------------------------- scene
class Scene:
    def __init__(self, lo, hi, W=900, margin=0.07, extra=()):
        self.W = W
        pts = [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])] + list(extra)
        sx = [(x - y) * K for x, y, z in pts]; sy = [(x + y) * 0.5 - z for x, y, z in pts]
        span = max(max(sx) - min(sx), max(sy) - min(sy))
        self.S = W * (1 - 2 * margin) / span
        self.ox = W / 2 - self.S * (max(sx) + min(sx)) / 2
        self.oy = W / 2 - self.S * (max(sy) + min(sy)) / 2
        self.rgb = np.ones((W, W, 3)); self.a = np.zeros((W, W))
        self.shadow = Image.new('L', (W, W), 0)
        materials()

    def P(self, p):
        x, y, z = p
        return np.array([self.ox + (x - y) * K * self.S, self.oy + ((x + y) * 0.5 - z) * self.S])

    def _mask(self, scr):
        m = Image.new('L', (self.W, self.W), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in scr], fill=255)
        return np.array(m) > 127

    def _outline(self, scr, k=0.72, width=2):
        m = Image.new('L', (self.W, self.W), 0)
        ImageDraw.Draw(m).line([tuple(p) for p in scr] + [tuple(scr[0])], fill=255, width=width, joint='curve')
        mm = (np.array(m) > 0) & (self.a > 0)
        self.rgb[mm] *= k

    # -- textured planar polygon
    def face(self, pts3, n, mat, seed=0, lines=None, alpha=1.0, outline=True, shade=None):
        pts3 = [np.asarray(p, float) for p in pts3]
        n = np.asarray(n, float); n = n / np.linalg.norm(n)
        e1 = pts3[1] - pts3[0]; e1 = e1 - n * np.dot(e1, n); e1 /= np.linalg.norm(e1)
        e2 = np.cross(n, e1)
        O = pts3[0]; o = self.P(O); u = self.P(O + e1) - o; v = self.P(O + e2) - o
        scr = [self.P(p) for p in pts3]
        mk = self._mask(scr)
        ys, xs = np.nonzero(mk)
        if len(xs) == 0: return
        Minv = np.linalg.inv(np.array([u, v]).T)
        rel = np.stack([xs + 0.5 - o[0], ys + 0.5 - o[1]], -1) @ Minv.T
        tex = MAT[mat]
        tx = ((rel[:, 0] * TPU + seed * 131) % TEXN).astype(int); ty = ((rel[:, 1] * TPU + seed * 71) % TEXN).astype(int)
        alb = tex[ty, tx].copy()
        f = np.full(len(xs), light(n) if shade is None else shade)
        if lines:
            for axis, sp, dk in lines:
                q = (rel[:, 0] if axis == 'e1' else rel[:, 1]) % sp
                f = f * (1 - dk * (np.minimum(q, sp - q) < 0.045))
        col = alb * f[:, None]
        if alpha < 1:
            col = self.rgb[ys, xs] * (1 - alpha) + col * alpha
        self.rgb[ys, xs] = col; self.a[ys, xs] = 1
        if outline: self._outline(scr)

    def box(self, x, y, z, w, d, h, mat, seed=0, lines=None, top_lines=None, alpha=1.0):
        self.face([(x + w, y, z), (x + w, y + d, z), (x + w, y + d, z + h), (x + w, y, z + h)], (1, 0, 0), mat, seed + 1, lines, alpha)
        self.face([(x, y + d, z), (x + w, y + d, z), (x + w, y + d, z + h), (x, y + d, z + h)], (0, 1, 0), mat, seed + 2, lines, alpha)
        self.face([(x, y, z + h), (x + w, y, z + h), (x + w, y + d, z + h), (x, y + d, z + h)], (0, 0, 1), mat, seed + 3, top_lines, alpha)

    def layered(self, x, y, w, d, layers, seed=0):
        """Soil column: layers = [(z0, z1, mat), ...] bottom->top."""
        for k, (z0, z1, m) in enumerate(sorted(layers)):
            self.box(x, y, z0, w, d, z1 - z0, m, seed + 10 * k)

    def prism_xz(self, sec, y0, y1, mat, seed=0, cap_lines=None, lines=None):
        """Section (x,z) extruded along y."""
        area = sum(sec[i][0] * sec[(i + 1) % len(sec)][1] - sec[(i + 1) % len(sec)][0] * sec[i][1] for i in range(len(sec)))
        fs = []
        for i in range(len(sec)):
            (xa, za), (xb, zb) = sec[i], sec[(i + 1) % len(sec)]
            dx, dz = xb - xa, zb - za
            nx, nz = (dz, -dx) if area > 0 else (-dz, dx)
            if nx + nz <= 1e-9 or math.hypot(dx, dz) < 1e-9: continue
            fs.append(((xa + xb) / 2 + (za + zb) / 2, [(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], (nx, 0, nz)))
        for k, (_, q, n) in enumerate(sorted(fs, key=lambda f: f[0])):
            self.face(q, n, mat, seed + k, lines)
        self.face([(x, y1, z) for x, z in sec], (0, 1, 0), mat, seed + 99, cap_lines)

    def prism_yz(self, sec, x0, x1, mat, seed=0, cap_lines=None, lines=None, mats=None):
        """Section (y,z) extruded along x. mats: optional per-edge material override list."""
        area = sum(sec[i][0] * sec[(i + 1) % len(sec)][1] - sec[(i + 1) % len(sec)][0] * sec[i][1] for i in range(len(sec)))
        fs = []
        for i in range(len(sec)):
            (ya, za), (yb, zb) = sec[i], sec[(i + 1) % len(sec)]
            dy, dz = yb - ya, zb - za
            ny, nz = (dz, -dy) if area > 0 else (-dz, dy)
            if ny + nz <= 1e-9 or math.hypot(dy, dz) < 1e-9: continue
            m = mats[i] if mats else mat
            fs.append(((ya + yb) / 2 + (za + zb) / 2, [(x0, ya, za), (x0, yb, zb), (x1, yb, zb), (x1, ya, za)], (0, ny, nz), m))
        for k, (_, q, n, m) in enumerate(sorted(fs, key=lambda f: f[0])):
            self.face(q, n, m, seed + k, lines)
        self.face([(x1, y, z) for y, z in sec], (1, 0, 0), mat, seed + 99, cap_lines)

    def cyl(self, cx, cy, z, r, h, mat, seed=0, th=(-math.pi / 4, 3 * math.pi / 4), top=True, top_half=False):
        """Vertical cylinder. th = visible angle range (front half default; (0, 3pi/4) for a y>=cy cut)."""
        ts = np.linspace(th[0], th[1], 40)
        rim = lambda zz: [(cx + r * math.cos(t), cy + r * math.sin(t), zz) for t in ts]
        scr = [self.P(p) for p in rim(z + h)] + [self.P(p) for p in reversed(rim(z))]
        mk = self._mask(scr); ys, xs = np.nonzero(mk)
        if len(xs):
            axis = self.P((cx, cy, 0))[0]
            u = np.clip((xs + 0.5 - axis) / (r * math.sqrt(2) * K * self.S), -1, 1)
            theta = np.arccos(u) - math.pi / 4
            nx, ny = np.cos(theta), np.sin(theta)
            L = 0.72 * np.clip(nx, 0, None) ** 2 + 0.88 * np.clip(ny, 0, None) ** 2 + 0.55 * (1 - np.clip(nx, 0, None) ** 2 - np.clip(ny, 0, None) ** 2)
            L = L * (0.92 + 0.12 * np.clip(np.cos(theta - math.pi / 3), 0, None))
            xy = cx + cy + r * (nx + ny)
            zz = xy * 0.5 - (ys + 0.5 - self.oy) / self.S
            tx = ((r * theta * TPU + seed * 131) % TEXN).astype(int); ty = ((zz * TPU + seed * 71) % TEXN).astype(int)
            self.rgb[ys, xs] = MAT[mat][ty, tx] * L[:, None]; self.a[ys, xs] = 1
            self._outline(scr)
        if top:
            tt = np.linspace(0, math.pi, 30) if top_half else np.linspace(0, 2 * math.pi, 48)[:-1]
            ring = [(cx + r * math.cos(t), cy + r * math.sin(t), z + h) for t in tt]
            self.face(ring, (0, 0, 1), mat, seed + 5)

    def cone_down(self, cx, cy, z, r, h, mat, seed=0, half=False):
        apex = (cx, cy, z - h); n = 24
        fs = []
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            if half and (math.sin(t0) < -1e-9 or math.sin(t1) < -1e-9): continue
            p0 = np.array((cx + r * math.cos(t0), cy + r * math.sin(t0), z)); p1 = np.array((cx + r * math.cos(t1), cy + r * math.sin(t1), z))
            nn = np.cross(p1 - p0, np.array(apex) - p0)
            if nn[2] > 0: nn = -nn
            nn = -nn if np.dot(nn, ((p0 + p1) / 2 - np.array((cx, cy, z)))) < 0 else nn
            if nn.sum() <= 0: continue
            fs.append((p0.sum(), [p0, p1, apex], nn))
        for k, (_, q, nn) in enumerate(sorted(fs, key=lambda f: f[0])):
            self.face(q, nn, mat, seed + k, outline=False)

    def pyramid_down(self, x, y, z, w, d, h, mat, seed=0):
        apex = (x + w / 2, y + d / 2, z - h)
        self.face([(x + w, y, z), (x + w, y + d, z), apex], (h, 0, -w / 2), mat, seed)
        self.face([(x, y + d, z), (x + w, y + d, z), apex], (0, h, -d / 2), mat, seed + 1)

    def tilted_box(self, x, y, z, w, d, h, ang, mat, seed=0, lines=None):
        """Box rotated about the y axis through (x,*,z) by ang (radians, leans toward +x)."""
        ca, sa = math.cos(ang), math.sin(ang)
        R = lambda u, v, t: (x + u * ca + t * sa, y + v, z - u * sa + t * ca)
        C = {(i, j, k): R(i * w, j * d, k * h) for i in (0, 1) for j in (0, 1) for k in (0, 1)}
        faces = [([(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], (ca, 0, -sa)), ([(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], (0, 1, 0)),
                 ([(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], (sa, 0, ca)), ([(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)], (-ca, 0, sa))]
        for k, (idx, n) in enumerate(faces):
            if sum(n) > 0: self.face([C[i] for i in idx], n, mat, seed + k, lines)

    # -- rebar / strands
    def bar(self, A, B, r, col=(0.36, 0.37, 0.39), ribs=3.0):
        A, B = np.asarray(A, float), np.asarray(B, float)
        d3 = (B - A) / np.linalg.norm(B - A)
        e1 = np.cross(d3, [0, 0, 1] if abs(d3[2]) < 0.9 else [1, 0, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(d3, e1)
        a, b = self.P(A), self.P(B); L = np.linalg.norm(b - a); uu = (b - a) / L; nn = np.array([-uu[1], uu[0]])
        p0 = self.P(np.zeros(3)); rs = r * math.hypot(np.dot(self.P(e1) - p0, nn), np.dot(self.P(e2) - p0, nn))
        lw = np.linalg.norm(B - A)
        cs = np.array([a + nn * rs, a - nn * rs, b + nn * rs, b - nn * rs])
        x0, y0 = np.maximum(np.floor(cs.min(0)).astype(int) - 2, 0); x1, y1 = np.minimum(np.ceil(cs.max(0)).astype(int) + 2, self.W)
        yy, xx = np.mgrid[y0:y1, x0:x1] + 0.5
        rx, ry = xx - a[0], yy - a[1]
        t = (rx * uu[0] + ry * uu[1]) / L; s = (rx * nn[0] + ry * nn[1]) / rs
        m = (t >= 0) & (t <= 1) & (np.abs(s) <= 1)
        sh = 0.45 + 0.55 * np.clip(np.cos(np.arcsin(np.clip(s, -1, 1)) + 0.55), 0, 1) + 0.35 * np.exp(-((s + 0.45) / 0.12) ** 2)
        if ribs:
            rib = (t * lw * ribs + s * 0.55) % 1.0
            sh = sh * (1 + 0.28 * (rib < 0.22) - 0.12 * ((rib > 0.22) & (rib < 0.32)))
        c = np.clip(sh[..., None] * np.array(col), 0, 1)
        self.rgb[y0:y1, x0:x1][m] = c[m]; self.a[y0:y1, x0:x1][m] = 1
        ring = [tuple(self.P(B + r * (math.cos(q) * e1 + math.sin(q) * e2))) for q in np.linspace(0, 2 * math.pi, 30)]
        cm = self._mask(ring); self.rgb[cm] = np.array(col) * 1.3; self.a[cm] = 1

    # -- 2D overlays (drawn in place, painter's order)
    def _layer(self, fn):
        lay = Image.new('RGBA', (self.W, self.W), (0, 0, 0, 0)); fn(ImageDraw.Draw(lay))
        arr = np.asarray(lay).astype(float) / 255
        al = arr[..., 3:4]
        self.rgb = self.rgb * (1 - al) + arr[..., :3] * al
        self.a = np.maximum(self.a, arr[..., 3])

    def arrow(self, A, B, col=(0.95, 0.45, 0.10), scale=1.0):
        p, q = self.P(A), self.P(B); W = self.W
        sw, hl, hw = W / 74 * scale, W / 20 * scale, W / 23 * scale
        dv = (q - p) / (np.linalg.norm(q - p) + 1e-9); nv = np.array([-dv[1], dv[0]])
        base = q - dv * hl
        c = tuple(int(v * 255) for v in col) + (255,)
        dk = tuple(int(v * 255 * 0.6) for v in col) + (255,)
        def draw(d):
            d.line([tuple(p), tuple(base)], fill=dk, width=int(sw + 4))
            d.polygon([tuple(q + dv * 2), tuple(base + nv * (hw + 2) - dv * 2), tuple(base - nv * (hw + 2) - dv * 2)], fill=dk)
            d.line([tuple(p), tuple(base)], fill=c, width=int(sw))
            d.polygon([tuple(q), tuple(base + nv * hw), tuple(base - nv * hw)], fill=c)
        self._layer(draw)

    def udl(self, x0, x1, y, z_top, z_tip, n, col=(0.95, 0.45, 0.10), axis='x'):
        xs = np.linspace(x0, x1, n)
        pts = lambda v, z: (v, y, z) if axis == 'x' else (y, v, z)
        a, b = self.P(pts(x0, z_top)), self.P(pts(x1, z_top))
        c = tuple(int(v * 255) for v in col) + (255,); dk = tuple(int(v * 255 * 0.6) for v in col) + (255,)
        self._layer(lambda d: (d.line([tuple(a), tuple(b)], fill=dk, width=int(self.W / 95 + 4)), d.line([tuple(a), tuple(b)], fill=c, width=int(self.W / 95))))
        for v in xs: self.arrow(pts(v, z_top), pts(v, z_tip), col, scale=0.8)

    def polyline(self, pts3, col, width=None, dash=None, closed=False):
        sc = [tuple(self.P(p)) for p in pts3] + ([tuple(self.P(pts3[0]))] if closed else [])
        w = int(width or self.W / 110); c = tuple(int(v * 255) for v in col) + (255,)
        def draw(d):
            if not dash: d.line(sc, fill=c, width=w, joint='curve'); return
            on, off = dash; acc = 0; drawing = True; seg = [sc[0]]
            for i in range(1, len(sc)):
                p0 = np.array(sc[i - 1]); p1 = np.array(sc[i]); L = np.linalg.norm(p1 - p0); pos = 0
                while pos < L:
                    lim = (on if drawing else off) - acc; step = min(lim, L - pos)
                    pt = p0 + (p1 - p0) * (pos + step) / L
                    if drawing: d.line([tuple(p0 + (p1 - p0) * pos / L), tuple(pt)], fill=c, width=w)
                    pos += step; acc += step
                    if acc >= (on if drawing else off) - 1e-6: acc = 0; drawing = not drawing
        self._layer(draw)

    def text(self, p3, s, col=(0.2, 0.2, 0.2), size=None):
        q = self.P(p3); f = ImageFont.truetype(FONT, int(size or self.W / 16))
        c = tuple(int(v * 255) for v in col) + (255,)
        self._layer(lambda d: d.text(tuple(q), s, fill=c, font=f, anchor='mm', stroke_width=3, stroke_fill=(255, 255, 255, 255)))

    def badge_seismic(self, fx=0.70, fy=0.11, fw=0.56):
        """Seismic sign: seismogram running into epicentre rings, on a white plate (per reference)."""
        W = self.W; w = fw * W; h = w * 0.40
        x0, y0 = fx * W - w / 2, fy * W - h / 2
        red = (206, 44, 40, 255)
        def draw(d):
            d.rounded_rectangle([x0 + 3, y0 + 6, x0 + w + 3, y0 + h + 6], radius=h * 0.28, fill=(0, 0, 0, 45))
            d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h * 0.28, fill=(255, 255, 255, 250), outline=(230, 232, 236, 255), width=2)
            cx, cy = x0 + w * 0.76, y0 + h / 2; R = h * 0.42
            for k in range(5):
                r = R * (1 - k * 0.18); lw = max(2, int(W / 230 * (1 + k * 0.5)))
                d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=red, width=lw)
            d.ellipse([cx - R * 0.16, cy - R * 0.16, cx + R * 0.16, cy + R * 0.16], fill=red)
            xs = np.linspace(x0 + w * 0.07, cx - R * 0.05, 26)
            amp = [0, 0, .2, -.15, .45, -.9, .95, -.3, .15, 0, 0, .2, -.15, .45, -.9, .95, -.3, .15, 0, 0, .3, -.5, .7, -.2, 0, 0]
            d.line([(x, cy - a * h * 0.36) for x, a in zip(xs, amp)], fill=red, width=int(W / 170), joint='curve')
        self._layer(draw)

    def contact_shadow(self, poly_xy, z, spread=0.22, strength=150):
        sc = [tuple(self.P((x, y, z))) for x, y in poly_xy]
        cx = np.mean([p[0] for p in sc]); cy = np.mean([p[1] for p in sc])
        big = [(cx + (p[0] - cx) * (1 + spread), cy + (p[1] - cy) * (1 + spread) + self.W * 0.012) for p in sc]
        ImageDraw.Draw(self.shadow).polygon(big, fill=strength)

    def image(self, out_px):
        sh = np.array(self.shadow.filter(ImageFilter.GaussianBlur(self.W / 40))) / 255.0 * 0.45
        alpha = np.maximum(self.a, sh)
        rgb = np.where(self.a[..., None] > 0, self.rgb, 0)
        img = np.dstack([np.clip(rgb, 0, 1) * 255, alpha * 255]).astype(np.uint8)
        return Image.fromarray(img, 'RGBA').resize((out_px, out_px), Image.LANCZOS)


def clip_band(poly, z0, z1):
    """Clip an (x,z) polygon to z0<=z<=z1 (Sutherland-Hodgman)."""
    def clip(pts, keep, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = keep(a), keep(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out
    def at(zc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / (b[1] - a[1]), zc)
    p = clip(poly, lambda q: q[1] >= z0, at(z0))
    if p: p = clip(p, lambda q: q[1] <= z1, at(z1))
    return p
