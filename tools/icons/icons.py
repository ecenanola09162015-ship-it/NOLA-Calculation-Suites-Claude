"""Ñola module icons (24). One function per module; geometry follows the decision-sheet remarks I-01..I-24.
Render: python3 export.py  (writes apps/web/public/icons/<slug>.webp)."""
import math, sys
import numpy as np
from iso3d import Scene, clip_band, light, MAT, TEXN

LOAD, WIND, EQ, GRN, PUR = (0.95, 0.45, 0.10), (0.16, 0.52, 0.86), (0.84, 0.20, 0.18), (0.16, 0.62, 0.38), (0.52, 0.30, 0.64)
REBAR, STRAND = (0.36, 0.37, 0.39), (0.66, 0.67, 0.69)


def ishape_x(s, x0, x1, yc, z0, bf, d, tf, tw, mat):
    """I-section member along x, centred on y=yc, bottom at z0."""
    s.box(x0, yc - bf / 2, z0, x1 - x0, bf, tf, mat, 1)
    s.box(x0, yc - tw / 2, z0 + tf, x1 - x0, tw, d - 2 * tf, mat, 2)
    s.box(x0, yc - bf / 2, z0 + d - tf, x1 - x0, bf, tf, mat, 3)


def notch_soil(s, X, Y, a, b, zc, layers):
    """Soil block 0..X, 0..Y with a cut-away pit x>=a, y>=b down to zc (front corner)."""
    s.layered(0, 0, a, Y, layers, 0)
    s.layered(a, 0, X - a, b, layers, 40)
    s.layered(a, b, X - a, Y - b, [(z0, min(z1, zc), m) for z0, z1, m in layers if z0 < zc], 80)


def rocks(s, pts, seed=3):
    rng = np.random.default_rng(seed)
    tex = MAT['rock']
    for (x, y, z, r) in sorted(pts, key=lambda p: p[0] + p[1] + p[2]):
        c = s.P((x, y, z)); rs = r * s.S
        n = 9; ang = np.sort(rng.uniform(0, 2 * math.pi, n))
        poly = [(c[0] + rs * rng.uniform(0.78, 1.12) * math.cos(t), c[1] + rs * 0.72 * rng.uniform(0.8, 1.1) * math.sin(t) - rs * 0.25) for t in ang]
        mk = s._mask(poly); ys, xs = np.nonzero(mk)
        if not len(xs): continue
        dx, dy = (xs - c[0]) / rs, (ys - c[1] + rs * 0.25) / rs
        sh = np.clip(0.95 - 0.35 * (dx * 0.5 + dy * 0.9), 0.45, 1.25)
        facet = ((np.arctan2(dy, dx) + math.pi) / (2 * math.pi) * 3).astype(int) % 3
        sh = sh * np.array([1.0, 0.9, 0.8])[facet]
        tx = ((xs * 1.3 + seed * 37) % TEXN).astype(int); ty = ((ys * 1.3 + seed * 19) % TEXN).astype(int)
        s.rgb[ys, xs] = tex[ty, tx] * sh[:, None] * np.array([1.0, 1.0, 1.02]); s.a[ys, xs] = 1
        s._outline(poly, 0.62, 2)
        seed += 1


# ------------------------------------------------------------------ CONCRETE
def rc_column():          # I-01: no footing, better texture
    s = Scene((0, 0, 0), (4, 4, 18), margin=0.1, extra=[(4, 7.5, 0)])
    s.contact_shadow([(0, 0), (4, 0), (4, 4), (0, 4)], 0, 0.5)
    s.box(0, 0, 0, 4, 4, 15, 'concrete', 1, lines=[('e1', 2.0, .06), ('e2', 5.0, .05)])
    for x, y in [(0.6, 0.6), (3.4, 0.6), (0.6, 3.4), (3.4, 3.4)]:
        s.bar((x, y, 14.6), (x, y, 17.8), 0.24, REBAR)
    return s


def slab():               # I-02: no top rebar
    s = Scene((0, 0, -4), (13, 11, 1.4), margin=0.08)
    s.contact_shadow([(0, 0), (13, 0), (13, 11), (0, 11)], -4, 0.1, 120)
    for x, y in [(0.8, 0.8), (10.6, 0.8), (0.8, 8.6), (10.6, 8.6)]:
        s.box(x, y, -4, 1.6, 1.6, 4, 'concrete', int(x + y))
    s.box(0, 0, 0, 13, 11, 1.4, 'concrete', 7, lines=[('e1', 3.25, .05)])
    return s


def rc_beam():            # I-03: deeper rectangular beam + UDL
    s = Scene((0, 0, -6), (16, 2.6, 12), margin=0.07)
    s.contact_shadow([(0, -0.5), (16, -0.5), (16, 3), (0, 3)], -6, 0.15, 120)
    s.box(0.2, 0, -6, 2.6, 2.6, 6, 'concrete', 3); s.box(13.2, 0, -6, 2.6, 2.6, 6, 'concrete', 4)
    s.box(0, 0, 0, 16, 2.6, 5.2, 'concrete', 5, lines=[('e1', 4.0, .05)])
    s.udl(0.8, 15.2, 1.3, 11.5, 5.6, 8, LOAD)
    return s


def stairs():             # I-04: suspended flight + landing, beams at both ends
    T, R, N, W = 2.4, 1.6, 6, 6.0
    LZ = N * R; m = R / T; c = 1.5 / (T / math.hypot(T, R))
    s = Scene((0, 0, -2.6), (21, W, LZ), margin=0.06)
    s.contact_shadow([(0, 0), (21, 0), (21, W), (0, W)], -2.6, 0.05, 90)
    s.box(0, 0, LZ - 1.5 - 2.4, 2.2, W, 2.4, 'concrete', 1)                 # landing beam
    s.box(0, 0, LZ - 1.5, 6, W, 1.5, 'concrete', 2)                          # landing
    sec = [(18, 0)]
    for k in range(1, N + 1):
        x = 18 - (k - 1) * T; sec.append((x, k * R))
        if k < N: sec.append((x - T, k * R))
    sec += [(6, (18 - 6) * m - c), (18, -c)]
    s.prism_xz(sec, 0, W, 'concrete', 10)
    s.box(16.6, 0, -2.6, 2.4, W, 2.6, 'concrete', 30)                       # support beam
    s.box(19.0, 0, -1.2, 2.0, W, 1.2, 'concrete', 31)                        # floor slab stub
    return s


def shear_wall():         # I-05: vertical load + 2 layers protruding bars
    s = Scene((-5, 0, 0), (12, 2, 21), margin=0.06)
    s.contact_shadow([(0, 0), (12, 0), (12, 2), (0, 2)], 0, 0.25)
    s.box(0, 0, 0, 12, 2, 13, 'concrete', 1, lines=[('e1', 3.0, .05), ('e2', 4.4, .04)])
    for y in (0.5, 1.5):
        for x in np.arange(1.0, 11.6, 2.0):
            s.bar((x, y, 12.6), (x, y, 15.6), 0.2, REBAR)
    s.arrow((-5.2, 1, 11), (-0.4, 1, 11), LOAD)
    s.arrow((6, 1, 21), (6, 1, 16.4), LOAD)
    return s


def steel_deck():         # I-06 rev 3: composite slab, cut-away showing deck, mesh, stud, I-beam below
    P_, Y, L, A, B = 3.0, 15.0, 16.0, 7.0, 6.0
    prof = []
    for k in range(int(Y / P_)):
        y0 = P_ * k
        prof += [(y0, 1.4), (y0 + 0.7, 1.4), (y0 + 1.0, 0), (y0 + 2.0, 0), (y0 + 2.3, 1.4)]
    prof.append((Y, 1.4))
    conc = [(0, 3.4), (Y, 3.4)] + list(reversed(prof))
    deck = prof + [(y, z - 0.22) for y, z in reversed(prof)]
    def clip_y(poly, y1):                               # keep y <= y1
        sw = [(z, y) for y, z in poly]
        return [(y, z) for z, y in clip_band(sw, -1e9, y1)]
    s = Scene((0, -1, -4.3), (L, Y + 1, 3.4), margin=0.06)
    s.contact_shadow([(11, -1), (14, -1), (14, Y + 1), (11, Y + 1)], -4.3, 0.2, 110)
    # supporting I-beam (runs across the ribs)
    s.box(11, -1, -4.22, 3, Y + 2, 0.5, 'steel', 1); s.box(12.3, -1, -3.72, 0.4, Y + 2, 3.0, 'steel', 2); s.box(11, -1, -0.72, 3, Y + 2, 0.5, 'steel', 3)
    s.prism_yz(deck, 0, L, 'galv', 20, lines=[('e2', 0.8, .10)])
    s.prism_yz(conc, 0, A, 'concrete', 1)               # full slab behind the cut
    s.prism_yz(clip_y(conc, B), A, L, 'concrete', 30)   # slab strip along the back edge
    s.cyl(A + 3.0, B + 1.5, 0, 0.28, 2.3, 'galv', 40); s.cyl(A + 3.0, B + 1.5, 2.3, 0.6, 0.35, 'galv', 41)   # shear stud
    rust = (0.74, 0.40, 0.20)
    for y in np.arange(B + 1.2, Y, 2.0):
        s.bar((A - 0.1, y, 2.3), (L - 0.4, y, 2.3), 0.13, rust, ribs=0)
    for x in np.arange(A + 1.5, L, 2.5):
        s.bar((x, B - 0.1, 2.56), (x, Y - 0.4, 2.56), 0.13, rust, ribs=0)
    return s


def retaining_wall():     # I-07: textured soil layers, wider base
    Y = 8
    s = Scene((0, 0, -3), (15, Y, 13), margin=0.06)
    s.layered(0, 0, 15, Y, [(-3, -1.5, 'gravel'), (-1.5, 0, 'dsand')], 0)
    s.box(0, 0, 0, 15, Y, 1.6, 'concrete', 3)                               # wide base (heel + toe)
    s.layered(0, 0, 9, Y, [(1.6, 5.0, 'clay'), (5.0, 9.0, 'sand'), (9.0, 12.4, 'topsoil')], 20)
    s.box(9, 0, 1.6, 1.8, Y, 11.4, 'concrete', 5, lines=[('e2', 4.0, .04)])
    s.layered(10.8, 0, 4.2, Y, [(1.6, 3.2, 'topsoil')], 60)
    return s


def shallow_foundation(): # I-08: footing in a soil pit, realistic strata
    s = Scene((0, 0, -6), (14, 14, 12), margin=0.06)
    notch_soil(s, 14, 14, 5, 5, -3, [(-6, -3.5, 'sand'), (-3.5, -1.4, 'clay'), (-1.4, 0, 'topsoil')])
    s.box(6.5, 6.5, -3, 6, 6, 1.4, 'concrete', 3)
    s.box(8.5, 8.5, -1.6, 2, 2, 7.6, 'concrete', 4)
    s.arrow((9.5, 9.5, 13.5), (9.5, 9.5, 6.4), LOAD)
    return s


def pile_cap():           # I-09: improved concrete texture
    s = Scene((1, 1, -7), (11, 11, 8.5), margin=0.07)
    s.contact_shadow([(1, 1), (11, 1), (11, 11), (1, 11)], -7, 0.1, 110)
    for x, y in [(2, 2), (7.6, 2), (2, 7.6), (7.6, 7.6)]:
        s.box(x, y, -7, 1.4, 1.4, 7, 'concrete', int(x * 3 + y))
    s.box(1, 1, 0, 10, 10, 2.4, 'concrete', 9)
    s.box(4.5, 4.5, 2.4, 3, 3, 4.5, 'concrete', 11)
    for x, y in [(4.9, 4.9), (7.1, 4.9), (4.9, 7.1), (7.1, 7.1)]:
        s.bar((x, y, 6.6), (x, y, 8.5), 0.17, REBAR)
    return s


def driven_pile():        # I-10: no helmet, pyramid tip, strands, pile through layered soil section
    yc = 5.0
    s = Scene((0, 0, -13.5), (12, yc + 1.2, 11), margin=0.05)
    s.layered(0, 0, 12, yc, [(-13.5, -8, 'dsand'), (-8, -3, 'clay'), (-3, 0, 'topsoil')], 0)
    s.box(4.8, yc, -11, 2.4, 1.2, 11, 'concrete', 3)                         # below grade (front half)
    s.pyramid_down(4.8, yc - 1.2, -11, 2.4, 2.4, 2.4, 'concrete', 5)
    s.box(4.8, yc - 1.2, 0, 2.4, 2.4, 4.2, 'concrete', 6)                    # above grade
    for x, y in [(5.4, yc - 0.6), (6.6, yc - 0.6), (5.4, yc + 0.6), (6.6, yc + 0.6)]:
        s.bar((x, y, 4.0), (x, y, 6.0), 0.11, STRAND, ribs=6)
    s.arrow((6, yc, 11.5), (6, yc, 6.6), LOAD)
    return s


def bored_pile():         # I-11: tip, pile through layered soil section
    yc = 5.0
    s = Scene((0, 0, -13.5), (12, yc + 1.8, 9), margin=0.05)
    s.layered(0, 0, 12, yc, [(-13.5, -8, 'gravel'), (-8, -3, 'silt'), (-3, 0, 'topsoil')], 0)
    s.cyl(6, yc, -11, 1.8, 11, 'concrete', 3, th=(0, 3 * math.pi / 4), top=False)
    s.cone_down(6, yc, -11, 1.8, 1.4, 'concrete', 4, half=True)
    s.cyl(6, yc, 0, 1.8, 3.4, 'concrete', 5)
    for k in range(6):
        t = 2 * math.pi * k / 6 + 0.3
        x, y = 6 + 1.25 * math.cos(t), yc + 1.25 * math.sin(t)
        if math.sin(t) < 0: s.bar((x, y, 3.0), (x, y, 6.2), 0.16, REBAR)
    for k in range(6):
        t = 2 * math.pi * k / 6 + 0.3
        x, y = 6 + 1.25 * math.cos(t), yc + 1.25 * math.sin(t)
        if math.sin(t) >= 0: s.bar((x, y, 3.0), (x, y, 6.2), 0.16, REBAR)
    return s


# ------------------------------------------------------------------ STEEL
def steel_column():       # I-12: add downward load
    s = Scene((1, 1, -0.8), (10, 10, 19), margin=0.06)
    s.contact_shadow([(1, 1), (10, 1), (10, 10), (1, 10)], -0.8, 0.1, 120)
    s.box(1, 1, -0.8, 9, 9, 0.8, 'steel_dark', 1)
    s.box(2.5, 2.5, 0, 6, 1, 12, 'steel', 2); s.box(5, 3.5, 0, 1, 4, 12, 'steel', 3); s.box(2.5, 7.5, 0, 6, 1, 12, 'steel', 4)
    s.arrow((5.5, 5.5, 19.5), (5.5, 5.5, 12.6), LOAD)
    return s


def steel_beam():         # I-13: fixed (wall) + pinned (3D triangle) supports, UDL
    yc = 4.0
    s = Scene((-2.5, 0.5, -3.2), (16.8, 7.5, 11.5), margin=0.05)
    s.contact_shadow([(-2.5, 0.5), (16.5, 0.5), (16.5, 7.5), (-2.5, 7.5)], -5, 0.05, 90)
    s.box(-2.5, 0.5, -5, 2.5, 7, 13, 'concrete', 1)                          # fixed end: beam built into wall
    s.box(12.4, 2.0, -3.2, 4.2, 4.0, 0.6, 'concrete', 2)                     # pin support pad
    s.prism_xz([(13.2, -2.6), (15.8, -2.6), (14.5, 0)], 2.4, 5.6, 'steel_dark', 3)
    ishape_x(s, 0, 16, yc, 0, 3.0, 4.8, 0.5, 0.45, 'steel')
    s.udl(0.8, 15.2, yc, 11.0, 5.4, 8, LOAD)
    return s


def base_plate():         # I-14: base plate + anchor bolts highlighted
    s = Scene((0, 0, -5), (12, 12, 5), margin=0.06)
    s.box(0, 0, -5, 12, 12, 5, 'concrete', 1)
    s.box(1.8, 1.8, 0, 8.4, 8.4, 0.8, 'steel_hi', 2)
    bolts = [(3.1, 3.1), (8.9, 3.1), (3.1, 8.9), (8.9, 8.9)]
    def bolt(x, y):
        s.cyl(x, y, 0.8, 0.75, 0.2, 'brass', 3); s.cyl(x, y, 1.0, 0.55, 0.6, 'brass', 4)
        s.bar((x, y, 1.5), (x, y, 2.9), 0.28, (0.80, 0.62, 0.22), ribs=5)
    for b in bolts[:3]: bolt(*b)
    s.box(4.0, 4.4, 0.8, 4.0, 0.6, 3.4, 'muted', 5); s.box(5.7, 5.0, 0.8, 0.6, 2.0, 3.4, 'muted', 6); s.box(4.0, 7.0, 0.8, 4.0, 0.6, 3.4, 'muted', 7)
    bolt(*bolts[3])
    return s


def purlins():            # I-15 rev 3: C purlins highlighted (blue) on a muted I-beam rafter; wider spacing
    s = Scene((0, -1, -4.2), (13, 15.6, 4.0), margin=0.06)
    s.contact_shadow([(5, -1), (7.4, -1), (7.4, 15.6), (5, 15.6)], -4.2, 0.4, 100)
    s.box(5, -1, -4.2, 2.4, 16.6, 0.4, 'muted', 1); s.box(6.0, -1, -3.8, 0.4, 16.6, 3.4, 'muted', 2); s.box(5, -1, -0.4, 2.4, 16.6, 0.4, 'muted', 3)
    for k, y in enumerate((0.0, 6.6, 13.2)):
        s.box(0, y, 0, 13, 1.9, 0.38, 'steel_hi', 10 + k); s.box(0, y, 0.38, 13, 0.38, 3.24, 'steel_hi', 20 + k)
        s.box(0, y + 1.52, 0.38, 13, 0.38, 0.8, 'steel_hi', 30 + k)
        s.box(0, y, 3.62, 13, 1.9, 0.38, 'steel_hi', 40 + k); s.box(0, y + 1.52, 2.82, 13, 0.38, 0.8, 'steel_hi', 50 + k)
    return s


# ------------------------------------------------------------------ LOADS
def gravity_loads():      # I-25: Gravity Load Planner - tributary area of the interior column + area load
    L, t, H = 12.0, 0.9, 5.0                # 2x2-bay floor on 9 columns
    s = Scene((0, 0, -H), (L, L, t + 6.0), margin=0.07)
    s.contact_shadow([(0, 0), (L, 0), (L, L), (0, L)], -H, 0.08, 110)
    cs = 1.1; pos = [0.5, L / 2 - cs / 2, L - 0.5 - cs]
    for i, x in enumerate(pos):
        for j, y in enumerate(pos):
            s.box(x, y, -H, cs, cs, H, 'concrete', i * 3 + j)
    s.box(0, 0, 0, L, L, t, 'concrete', 20, lines=[('e1', 3.0, .04)])
    a, b = L / 4, 3 * L / 4                 # tributary area = half a bay each way
    s.face([(a, a, t + 0.01), (b, a, t + 0.01), (b, b, t + 0.01), (a, b, t + 0.01)], (0, 0, 1), 'orange', 7, alpha=0.55)
    s.polyline([(a, a, t + 0.02), (b, a, t + 0.02), (b, b, t + 0.02), (a, b, t + 0.02)], (0.80, 0.33, 0.06),
               width=s.W / 200, dash=(14, 9), closed=True)
    g = [a + 1.2, b - 1.2]
    for x, y in sorted([(x, y) for x in g for y in g], key=lambda p: p[0] + p[1]):   # back to front
        s.arrow((x, y, t + 4.6), (x, y, t + 0.1), LOAD, scale=0.85)
    return s


def seismogram(n, burst, seed):
    """Seismogram trace on u in 0..1: quiet baseline, small P arrivals, sharp S burst at `burst`, decay."""
    rng = np.random.default_rng(seed); u = np.linspace(0, 1, n); y = np.zeros(n)
    for i, v in enumerate(u):
        if v < burst - 0.22: amp = 0.04 + 0.05 * rng.random()
        elif v < burst - 0.06: amp = 0.18 + 0.12 * rng.random()
        elif v < burst + 0.06: amp = 0.75 + 0.25 * rng.random()
        else: amp = max(0.04, 0.95 * math.exp(-(v - burst - 0.06) * 7.5)) * (0.7 + 0.3 * rng.random())
        y[i] = amp if i % 2 else -amp
    y[0] = y[-1] = 0
    return u, y


def seismic_sign_below(s, left3, right3, bottom3):
    """Seismic sign on a white plate tucked under a block: two seismogram bursts running into epicentre rings."""
    W = s.W; l, r, bot = s.P(left3), s.P(right3), s.P(bottom3)
    cx = (l[0] + r[0]) / 2; w = (r[0] - l[0]) * 0.86; h = w * 0.30; cy = bot[1] + h * 0.22
    red = (206, 44, 40, 255)
    def draw(d):
        d.rounded_rectangle([cx - w / 2 + 3, cy - h / 2 + 6, cx + w / 2 + 3, cy + h / 2 + 6], radius=h * 0.3, fill=(0, 0, 0, 40))
        d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=h * 0.3, fill=(255, 255, 255, 252),
                            outline=(226, 229, 234, 255), width=2)
        R = h * 0.40
        for k in range(4):
            rk = R * (1 - k * 0.22)
            d.ellipse([cx - rk, cy - rk, cx + rk, cy + rk], outline=red, width=max(3, int(W / 260 * (1 + k * 0.4))))
        d.ellipse([cx - R * 0.17, cy - R * 0.17, cx + R * 0.17, cy + R * 0.17], fill=red)
        x0, x1 = cx - w * 0.44, cx + w * 0.44
        for xa, xb, flip in ((x0, cx - R * 1.08, False), (cx + R * 1.08, x1, True)):
            u, y = seismogram(22, 0.75, 5)
            if flip: u = 1 - u
            d.line([(xa + (xb - xa) * a, cy - b * h * 0.36) for a, b in zip(u, y)], fill=red, width=int(W / 120), joint='curve')
    s._layer(draw)


def seismic_loads():      # I-16 rev 4: 3 storeys + storey forces; seismic sign below the soil block
    s = Scene((-6, -1, -2), (14, 14, 13), margin=0.06, extra=[(15, 15, -9.5)])
    s.layered(-1, -1, 15, 15, [(-2, -1, 'clay'), (-1, 0, 'topsoil')], 0)
    for st in range(3):
        z0 = st * 4.2
        for x, y in [(1.5, 1.5), (10.5, 1.5), (1.5, 10.5), (10.5, 10.5)]:
            s.box(x, y, z0, 1.0, 1.0, 3.4, 'concrete', st * 10 + int(x))
        s.box(1, 1, z0 + 3.4, 11, 11, 0.8, 'concrete', st * 10 + 5)
    for z, L in [(4.0, 3.0), (8.2, 5.5), (12.4, 8.0)]:
        s.arrow((3.6 - L, 13, z), (3.6, 13, z), EQ)
    seismic_sign_below(s, (-1, 15, -2), (15, -1, -2), (15, 15, -2))
    return s


def wind_loads():         # I-17 rev 4: gable warehouse + wind gusts curling toward the wall
    s = Scene((-1, -1, -0.6), (17, 11, 8.6), margin=0.05, extra=[(0, 30, 6), (0, 30, -1)])
    s.box(-1, -1, -0.6, 18, 12, 0.6, 'concrete', 1)
    sec = [(0, 0), (10, 0), (10, 6), (5, 8.6), (0, 6)]
    s.prism_yz(sec, 0, 16, 'cladding', 2, cap_lines=[('e1', 0.6, .10)], lines=[('e2', 0.6, .10)],
               mats=[None, 'cladding', 'roof', 'roof', 'cladding'])
    s.face([(16.02, 3.2, 0), (16.02, 6.8, 0), (16.02, 6.8, 4.2), (16.02, 3.2, 4.2)], (1, 0, 0), 'door', 9, lines=[('e2', 0.35, .12)])
    # curling wind gusts drawn flat (symbol style, per reference), flowing toward the long wall
    W = s.W
    def gust(end3, length, r, up, width):
        wx, ey = s.P(end3); ex = wx - r * 1.25; sx = ex - length
        pts = [(sx, ey), (ex, ey)]                       # tail upwind, curl at the wall end
        for t in np.linspace(0, 1.55 * math.pi, 40):
            rr = r * (1 - 0.30 * t / (2 * math.pi))
            pts.append((ex + rr * math.sin(t), ey - up * (r - rr * math.cos(t))))
        def draw(d):
            d.line(pts, fill=(255, 255, 255, 255), width=int(width + W / 110), joint='curve')
            d.line(pts, fill=(22, 128, 210, 255), width=int(width), joint='curve')
            for p in (pts[0], pts[-1]):
                rr2 = width / 2
                d.ellipse([p[0] - rr2, p[1] - rr2, p[0] + rr2, p[1] + rr2], fill=(22, 128, 210, 255))
        s._layer(draw)
    gust((0.6, 10.2, 7.4), W * 0.22, W * 0.046, 1, W / 50)
    gust((2.5, 10.2, 4.4), W * 0.34, W * 0.044, 1, W / 50)
    gust((5.5, 10.2, 1.2), W * 0.24, W * 0.040, -1, W / 50)
    return s


def load_combinations():  # I-18 rev 3: Σ followed by a stylised L, same 3D style
    sig = [(0, 0), (9, 0), (9, 2.6), (4.4, 2.6), (7.0, 6), (4.4, 9.4), (9, 9.4), (9, 12), (0, 12), (0, 10.2), (3.6, 6), (0, 1.8)]
    ell = [(0, 0), (6.4, 0), (6.4, 2.6), (2.9, 2.6), (2.9, 12), (0, 12)]
    ell = [(10.6 + x + 0.20 * z, z) for x, z in ell]          # italic shear
    s = Scene((-1, -1, -0.6), (20.5, 3.6, 12), margin=0.07)
    s.contact_shadow([(-1, -1), (20.5, -1), (20.5, 3.6), (-1, 3.6)], -0.6, 0.06, 110)
    s.box(-1, -1, -0.6, 21.5, 4.6, 0.6, 'concrete', 1)
    s.prism_xz(sig, 0, 1.6, 'orange', 2)
    s.prism_xz(ell, 0, 1.6, 'orange2', 3)
    return s


# ------------------------------------------------------------------ GEOTECHNICAL
def soil_bearing():       # I-19: footing embedded, realistic soil, pressure bulbs on section
    yc = 6.0
    s = Scene((0, 0, -10), (14, yc + 1.8, 10), margin=0.05)
    s.layered(0, 0, 14, yc, [(-10, -6, 'dsand'), (-6, -2.5, 'clay'), (-2.5, 0, 'topsoil')], 0)
    for k, (rx, rz) in enumerate([(2.2, 2.0), (3.6, 3.8), (5.0, 5.8)]):
        pts = [(7 + rx * math.cos(t), yc + 0.02, -2.6 - rz * math.sin(t)) for t in np.linspace(0, math.pi, 30)]
        s.polyline(pts, (0.92, 0.42, 0.12), width=int(s.W / 60), dash=(24, 13))
    s.box(4, yc, -2.6, 6, 1.8, 1.2, 'concrete', 3)
    s.box(6.2, yc, -1.4, 1.6, 0.8, 1.4, 'concrete', 4)
    s.box(6.2, yc - 0.8, 0, 1.6, 1.6, 6, 'concrete', 5)
    s.arrow((7, yc, 10.5), (7, yc, 6.4), LOAD)
    return s


def pile_bearing():       # I-20: pile embedded through strata, friction + end bearing
    yc = 5.0
    s = Scene((0, 0, -14), (12, yc + 1.6, 9), margin=0.05)
    s.layered(0, 0, 12, yc, [(-14, -9, 'gravel'), (-9, -5, 'sand'), (-5, -2, 'clay'), (-2, 0, 'topsoil')], 0)
    s.cyl(6, yc, -10.5, 1.5, 10.5, 'concrete', 3, th=(0, 3 * math.pi / 4), top=False)
    s.cone_down(6, yc, -10.5, 1.5, 0.8, 'concrete', 4, half=True)
    s.cyl(6, yc, 0, 1.5, 2.6, 'concrete', 5)
    for z in (-3, -7):
        s.arrow((3.2, yc + 0.02, z - 2.4), (3.2, yc + 0.02, z), GRN, 1.0)
        s.arrow((8.8, yc + 0.02, z - 2.4), (8.8, yc + 0.02, z), GRN, 1.0)
    s.arrow((6, yc + 0.02, -15.5), (6, yc + 0.02, -12), GRN, 1.05)
    s.arrow((6, yc, 9.5), (6, yc, 3.2), LOAD)
    return s


def settlement():         # I-21: settled footing vs original (ghost), δ
    yc = 6.0
    s = Scene((0, 0, -9), (14, yc + 1.8, 9), margin=0.05)
    s.layered(0, 0, 14, yc, [(-9, -5.5, 'clay'), (-5.5, -2.5, 'silt'), (-2.5, 0, 'topsoil')], 0)
    for k, dz in enumerate((0.0, 0.9)):
        zb = -5.5 + dz if k else -2.5
        pts = [(x, yc + 0.02, zb - 1.2 * math.exp(-((x - 7) / 3.0) ** 2)) for x in np.linspace(0.2, 13.8, 40)]
        s.polyline(pts, (0.30, 0.20, 0.12), width=int(s.W / 180))
    s.box(4, yc, -3.6, 6, 1.8, 1.4, 'concrete', 3)                          # settled position
    s.box(6.2, yc - 0.8, -2.2, 1.6, 1.6, 8.2, 'concrete', 4)
    g = [(4, yc, -2.2), (10, yc, -2.2), (10, yc + 1.8, -2.2), (4, yc + 1.8, -2.2)]
    s.polyline([(4, yc + 1.8, -0.8), (10, yc + 1.8, -0.8), (10, yc, -0.8)], PUR, width=int(s.W / 75), dash=(18, 10))
    s.polyline([(4, yc + 1.8, -0.8), (4, yc + 1.8, -2.2)], PUR, width=int(s.W / 75), dash=(18, 10))
    s.polyline([(10, yc + 1.8, -0.8), (10, yc + 1.8, -2.2)], PUR, width=int(s.W / 75), dash=(18, 10))
    s.arrow((12.9, yc + 1.8, 2.0), (12.9, yc + 1.8, -2.1), PUR, 1.1)
    s.text((14.6, yc + 1.8, 3.2), 'δ', PUR, size=s.W / 8)
    return s


def slope_section(s, layers, Y=8, top=None):
    poly = [(0, -4), (0, 7), (4, 7), (11, 0), (15, 0), (15, -4)]
    for k, (z0, z1, m) in enumerate(layers):
        p = clip_band(poly, z0, z1)
        if len(p) >= 3: s.prism_xz(p, 0, Y, m, 10 * k)


def slope_stability():    # I-22: more soil layers, soil-coloured face, prominent slip circle
    Y = 8
    s = Scene((0, 0, -4), (15, Y, 9.5), margin=0.05)
    slope_section(s, [(-4, -1, 'gravel'), (-1, 2.5, 'clay'), (2.5, 5, 'silt'), (5, 7, 'topsoil')], Y)
    cx, cz, r = 10.5, 8.62, 8.85
    a0, a1 = math.atan2(7 - cz, 1.8 - cx), math.atan2(0 - cz, 12.5 - cx)
    if a1 < a0: a1 += 2 * math.pi
    arc = [(cx + r * math.cos(t), Y + 0.03, cz + r * math.sin(t)) for t in np.linspace(a0, a1, 50)]
    s.polyline([(cx, Y + 0.03, cz), arc[0]], EQ, width=int(s.W / 260), dash=(8, 7))
    s.polyline([(cx, Y + 0.03, cz), arc[-1]], EQ, width=int(s.W / 260), dash=(8, 7))
    s.polyline(arc, EQ, width=int(s.W / 70), dash=(22, 12))
    s.arrow((4.6, Y + 0.03, 8.4), (8.8, Y + 0.03, 4.2), EQ, 0.85)
    c = s.P((cx, Y + 0.03, cz)); rr = s.W / 120
    s._layer(lambda d: d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=(214, 51, 46, 255)))
    return s


def liquefaction():       # I-23: seismic badge + granular saturated sand
    s = Scene((0, 0, -9), (14, 12, 8), margin=0.06)
    s.layered(0, 0, 14, 12, [(-9, -6, 'dsand'), (-6, -1.4, 'satsand'), (-1.4, 0, 'topsoil')], 0)
    for z0 in (-4.6, -2.8):
        a = [(x, 12.02, z0 + 0.3 * math.sin(x * 1.6)) for x in np.linspace(0.2, 13.8, 50)]
        b = [(14.02, y, z0 + 0.3 * math.sin(y * 1.6)) for y in np.linspace(0.2, 11.8, 45)]
        s.polyline(a, (0.18, 0.48, 0.78), width=int(s.W / 160)); s.polyline(b, (0.18, 0.48, 0.78), width=int(s.W / 160))
    for x, y in [(3, 9), (11.5, 3.5)]:
        s.cone_down(x, y, 0.6, 0.9, -0.0001, 'sand', 9)
    s.tilted_box(5, 4, 0, 4.2, 4.2, 7.5, math.radians(9), 'concrete', 3, lines=[('e1', 2.5, .05)])
    s.badge_seismic()
    return s


def riprap():             # I-24 (rev 2): dry-laid stone revetment against a cut soil bank
    Y = 9.0
    s = Scene((0, 0, -3), (14, Y, 10.5), margin=0.05)
    s.layered(0, 0, 14, Y, [(-3, -1.2, 'clay'), (-1.2, 0, 'dsand')], 0)
    s.layered(0, 0, 5.2, Y, [(0, 4.5, 'clay'), (4.5, 8.6, 'dsand'), (8.6, 10.2, 'topsoil')], 20)
    rng = np.random.default_rng(11)
    tints = [1.0, 0.86, 1.08, 0.93, 0.80, 1.12]
    def stone(x, y, z, w, d, h, k):
        t = tints[k % len(tints)] * rng.uniform(0.94, 1.06)
        ch = min(w, d) * rng.uniform(0.18, 0.3)
        base = [(x + ch, y), (x + w - ch, y), (x + w, y + ch), (x + w, y + d - ch), (x + w - ch, y + d), (x + ch, y + d), (x, y + d - ch), (x, y + ch)]
        base = [(px + rng.uniform(-0.12, 0.12), py + rng.uniform(-0.12, 0.12)) for px, py in base]
        cx, cy = x + w / 2, y + d / 2
        top = [(cx + (px - cx) * 0.80, cy + (py - cy) * 0.84) for px, py in base]
        zt = z + h
        bot3 = [(px, py, z) for px, py in base]; top3 = [(px, py, zt) for px, py in top]
        mid3 = [(cx + (px - cx) * 1.03, cy + (py - cy) * 1.03, z + h * 0.45) for px, py in base]
        faces = []
        for lo, hi in ((bot3, mid3), (mid3, top3)):
            for i in range(8):
                a, b = np.array(lo[i]), np.array(lo[(i + 1) % 8]); c2, d2 = np.array(hi[(i + 1) % 8]), np.array(hi[i])
                n = np.cross(b - a, d2 - a)
                ctr = (a + b + c2 + d2) / 4
                if np.dot(n, ctr - np.array((cx, cy, ctr[2]))) < 0: n = -n
                if n.sum() > 0: faces.append((ctr.sum(), [a, b, c2, d2], n))
        for _, q, n in sorted(faces, key=lambda f: f[0]):
            s.face(q, n, 'rock', k * 7 + 1, shade=light(n) * t, outline=False)
        s.face(top3, (0, 0, 1), 'rock', k * 7 + 3, shade=light((0, 0, 1)) * t, outline=False)
        sil = [s.P(p) for p in bot3 + top3]
        pts = sorted(set((round(p[0], 1), round(p[1], 1)) for p in sil))
        def cr(o, a2, b2): return (a2[0] - o[0]) * (b2[1] - o[1]) - (a2[1] - o[1]) * (b2[0] - o[0])
        lo_, up_ = [], []
        for p in pts:
            while len(lo_) >= 2 and cr(lo_[-2], lo_[-1], p) <= 0: lo_.pop()
            lo_.append(p)
        for p in reversed(pts):
            while len(up_) >= 2 and cr(up_[-2], up_[-1], p) <= 0: up_.pop()
            up_.append(p)
        s._outline(lo_[:-1] + up_[:-1], 0.5, 3)
    k = 0
    z = 0.0
    for course in range(6):
        h = rng.uniform(1.35, 1.75)
        x0 = 5.0 - course * 0.55 + rng.uniform(-0.15, 0.15)       # battered face leaning into the bank
        depth = 2.9 - course * 0.12
        cur = 0.0 if course % 2 == 0 else -1.0
        stones = []
        while cur < Y - 0.05:
            L = rng.uniform(2.0, 3.3)
            a, b = max(cur, 0.0), min(cur + L, Y)
            if b - a > 0.6: stones.append((a, b))
            cur += L + 0.1
        for (a, b) in stones:
            ww = depth * rng.uniform(0.9, 1.05); hh = h * rng.uniform(0.88, 1.0)
            stone(x0 + depth - ww, a, z, ww, b - a, hh, k); k += 1
        z += h + 0.08
    return s


ICONS = {
    'rc-column': rc_column, 'slab': slab, 'rc-beam': rc_beam, 'stairs': stairs, 'shear-wall': shear_wall,
    'steel-deck': steel_deck, 'retaining-wall': retaining_wall, 'shallow-foundation': shallow_foundation,
    'pile-cap': pile_cap, 'driven-pile': driven_pile, 'bored-pile': bored_pile, 'steel-column': steel_column,
    'steel-beam': steel_beam, 'base-plate': base_plate, 'purlins': purlins, 'gravity-loads': gravity_loads, 'seismic-loads': seismic_loads,
    'wind-loads': wind_loads, 'load-combinations': load_combinations, 'soil-bearing-capacity': soil_bearing,
    'pile-bearing-capacity': pile_bearing, 'settlement': settlement, 'slope-stability': slope_stability,
    'liquefaction': liquefaction, 'riprap': riprap,
}

if __name__ == '__main__':
    out = sys.argv[1]; only = sys.argv[2:] or list(ICONS)
    for k in only:
        ICONS[k]().image(384).save(f'{out}/{k}.png'); print('ok', k, flush=True)
