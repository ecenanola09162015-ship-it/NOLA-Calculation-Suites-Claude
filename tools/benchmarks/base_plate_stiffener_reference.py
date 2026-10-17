"""Independent reference for the stiffened base plate checks (engine 0.3.0).

Pure Python, no app code. Values printed here are hard-coded into
packages/calc-core/test/base-plate-stiffeners.test.ts.

Independent of the TypeScript engine in method:
- yield-line external work by numerical integration of the deflected
  surface delta(x, y) = min over segments (theta_k * distance to axis_k),
  internal work by the projection rule applied edge by edge, parameters
  by a 4000-point brute-force scan;
- stiffener loads by closed-form integration of the strip-method width;
- AISC 360-22 F11 / J4.2 / J2.4 / J10.2 / J10.3 and DG1 Ex. 4.7-7 by hand.
"""
from math import sqrt, hypot

E = 200000.0

# ---------------------------------------------------------------- yield line
def families(kind, a, b):
    """(name, param range, segments(param)); segment = (polygon, axis, theta)."""
    if kind == "P3":
        def A(s):
            return [([(0, 0), (b, 0), (b - s, a), (s, a)], "back", 1 / a),
                    ([(0, 0), (s, a), (0, a)], "left", 1 / s),
                    ([(b, 0), (b, a), (b - s, a)], "right", 1 / s)]
        def B(c):
            return [([(0, 0), (b, 0), (b / 2, c)], "back", 1 / c),
                    ([(0, 0), (b / 2, c), (b / 2, a), (0, a)], "left", 2 / b),
                    ([(b, 0), (b, a), (b / 2, a), (b / 2, c)], "right", 2 / b)]
        return [("A", b / 2, A), ("B", a, B)]
    def C1(s):
        return [([(0, 0), (b, 0), (b, a), (s, a)], "back", 1 / a),
                ([(0, 0), (s, a), (0, a)], "left", 1 / s)]
    def C2(t):
        return [([(0, 0), (b, 0), (b, t)], "back", 1 / t),
                ([(0, 0), (b, t), (b, a), (0, a)], "left", 1 / b)]
    return [("C1", b, C1), ("C2", a, C2)]


def dist(axis, x, y, b):
    return y if axis == "back" else x if axis == "left" else b - x


def internal_work(segs, kind, a, b):
    """Projection rule, edge by edge; m' = m on the segment's own support."""
    supported = {"back"} | ({"left", "right"} if kind == "P3" else {"left"})
    def on(edge_name, p, q):
        if edge_name == "back":
            return abs(p[1]) < 1e-9 and abs(q[1]) < 1e-9
        if edge_name == "left":
            return abs(p[0]) < 1e-9 and abs(q[0]) < 1e-9
        if edge_name == "right":
            return abs(p[0] - b) < 1e-9 and abs(q[0] - b) < 1e-9
        return abs(p[1] - a) < 1e-9 and abs(q[1] - a) < 1e-9
    w = 0.0
    for poly, axis, th in segs:
        for k in range(len(poly)):
            p, q = poly[k], poly[(k + 1) % len(poly)]
            if on(axis, p, q):
                w += th * hypot(q[0] - p[0], q[1] - p[1])  # negative line
                continue
            if any(on(e, p, q) for e in ("back", "left", "right", "free")):
                continue  # free edge (or another segment's support: none here)
            # positive yield line: projection onto the rotation axis
            proj = abs(q[0] - p[0]) if axis == "back" else abs(q[1] - p[1])
            w += th * proj
    return w


def external_work(segs, a, b, load, n=400):
    x0, x1, y0, y1 = load
    w = 0.0
    dx, dy = (x1 - x0) / n, (y1 - y0) / n
    for i in range(n):
        x = x0 + (i + 0.5) * dx
        for j in range(n):
            y = y0 + (j + 0.5) * dy
            w += min(th * dist(ax, x, y, b) for _, ax, th in segs)
    return w * dx * dy


def yield_line(kind, a, b, load, scan=60):
    best = (0, "", 0)
    for name, hi, f in families(kind, a, b):
        # coarse scan with a fast grid, then a fine scan around the best
        def ratio(p, n):
            segs = f(p)
            return external_work(segs, a, b, load, n) / internal_work(segs, kind, a, b)
        ps = [hi * k / scan for k in range(1, scan + 1)]
        vals = [ratio(p, 80) for p in ps]
        k = max(range(len(ps)), key=lambda i: vals[i])
        lo_, hi_ = ps[max(k - 1, 0)] if k > 0 else hi / scan / 10, ps[min(k + 1, len(ps) - 1)]
        for p in [lo_ + (hi_ - lo_) * i / 20 for i in range(21)]:
            if p <= 0:
                continue
            v = ratio(p, 240)
            if v > best[0]:
                best = (v, name, p)
    return best


def p3_closed_A(a, b, s):
    """Full uniform load, P3 family A: We/Wi in closed form (cross-check)."""
    # trapezoid: ∫y dA = b a²/2 − 2 (s a/2)(2a/3), θ = 1/a; triangles: ∫x dA = s² a/6, θ = 1/s
    we = (b * a * a / 2 - 2 * s * a * a / 3) / a + 2 * (s * s * a / 6) / s
    wi = (b + 2 * s) / a + 4 * a / s
    return we / wi


print("--- yield-line panels, full uniform load, coefficient / a^2")
for kind, a, b in [("P3", 100, 100), ("P3", 100, 200), ("P2", 100, 100), ("P2", 100, 200)]:
    v, name, p = yield_line(kind, a, b, (0, b, 0, a))
    print(kind, a, b, "coef/a2", round(v / a ** 2, 5), name, round(p, 2))
print("P3 closed form A at s = b/2, a = b = 100:", p3_closed_A(100, 100, 50) / 1e4)
# limits
v, *_ = yield_line("P3", 100, 2000, (0, 2000, 0, 100))
print("P3 a=100, b=2000 → cantilever a^2/2 = 0.5:", round(v / 1e4, 4))
v, *_ = yield_line("P3", 2000, 100, (0, 100, 0, 2000))
print("P3 a=2000, b=100 → fixed strip b^2/16 = 625:", round(v, 1))
# partial load: outer 40 mm of a P3 100 x 200 panel
v, name, p = yield_line("P3", 100, 200, (0, 200, 60, 100))
print("P3 100x200 outer 40 mm loaded coef", round(v, 2), name, round(p, 2))

# ---------------------------------------------------------- engine case (W12X40)
d, bf, tf, tw = 302.26, 203.454, 13.081, 7.493
Bx, By, tp, Fyp = 450.0, 500.0, 40.0, 248.0
fp = 900e3 / (Bx * By)  # LC1 axial, MPa
ts, hc, he, clip, Fys, w_col, Fexx = 16.0, 250.0, 100.0, 20.0, 248.0, 8.0, 482.0
phi_b, phi_v, phi_w = 0.9, 1.0, 0.75

# web-side stiffeners: n-zones split into two P2 panels
start_n = 0.8 * bf / 2
a_n = Bx / 2 - start_n
b_n = By / 2 - ts / 2
v, name, p = yield_line("P2", a_n, b_n, (0, b_n, 0, a_n))
coef = min(1.1 * v, a_n ** 2 / 2)
m_req = fp * coef
tp_req = sqrt(4 * m_req / (phi_b * Fyp))
print("--- web-side, LC1 n-zone P2 a", round(a_n, 3), "b", b_n, "coef", round(coef, 2), name,
      "m", round(m_req, 1), "tp", round(tp_req, 3))
# unstiffened m-zone (DG1 cantilever) and lambda n' governs elsewhere
m_dg1 = (By - 0.95 * d) / 2
print("m-zone cantilever m =", m_dg1)


def strip_load(root, start, tip, cap_neg, cap_pos):
    """V and M about the root for w(al) = ts + min(y, capN) + min(y, capP), y = al - start."""
    def wint(f, lo, hi, nn=20000):  # composite Simpson on the closed form
        h = (hi - lo) / nn
        s = f(lo) + f(hi)
        for k in range(1, nn):
            s += (4 if k % 2 else 2) * f(lo + k * h)
        return s * h / 3
    lo = max(root, start)
    w = lambda al: ts + min(al - start, cap_neg) + min(al - start, cap_pos)
    V = wint(lambda al: fp * w(al), lo, tip)
    M = wint(lambda al: fp * w(al) * (al - root), lo, tip)
    Mfun = lambda s: wint(lambda al: fp * w(al) * (al - root - s), max(lo, root + s), tip, 4000)
    Vfun = lambda s: wint(lambda al: fp * w(al), max(lo, root + s), tip, 4000)
    return V, M, Mfun, Vfun


def f11(h, Lb, kind="bearing"):
    Z, S = ts * h * h / 4, ts * h * h / 6
    Mp = Fys * Z
    if kind == "tension":
        return Mp
    lam = Lb * h / ts ** 2
    if lam <= 0.08 * E / Fys:
        return Mp
    if lam <= 1.9 * E / Fys:
        return min(Mp, (1.52 - 0.274 * lam * Fys / E) * Fys * S)
    return min(Mp, 1.9 * E / lam * S)


def member(root, start, tip, cn, cp):
    V, M, Mf, Vf = strip_load(root, start, tip, cn, cp)
    Ls = tip - root
    hh = lambda s: hc - (hc - he) * s / Ls
    flex = max(Mf(Ls * k / 20) / (phi_b * f11(hh(Ls * k / 20), Ls)) for k in range(19))
    shear = max(Vf(Ls * k / 20) / (phi_v * 0.6 * Fys * ts * hh(Ls * k / 20)) for k in range(19))
    Lw = hc - clip
    f = hypot(V / (2 * Lw), M / (2 * Lw * Lw / 6))
    cap = phi_w * 0.6 * Fexx * 0.7071 * w_col
    return V, M, flex, shear, f, cap


V, M, flex, shear, f, cap = member(tw / 2, start_n, Bx / 2, b_n, b_n)
print("web-side S1 LC1: V kN", round(V / 1e3, 3), "M kNm", round(M / 1e6, 4),
      "flex DCR", round(flex, 4), "shear DCR", round(shear, 4),
      "weld f", round(f, 2), "cap", round(cap, 2), "DCR", round(f / cap, 4))

# web-line stiffener, LC1: m-zone P2 panels each side of x = 0
start_m = 0.95 * d / 2
b_m = Bx / 2 - ts / 2
V, M, flex, shear, f, cap = member(d / 2, start_m, By / 2, b_m, b_m)
Lw = hc - clip
H, lb = 1.5 * M / Lw, Lw / 2
wly = 1.0 * 345 * tw * (2.5 * tf + lb)
r = lb / d
wcr = 0.75 * 0.4 * tw ** 2 * (1 + (4 * r - 0.2) * (tw / tf) ** 1.5 if r > 0.2 else 1 + 3 * r * (tw / tf) ** 1.5) * sqrt(E * 345 * tf / tw)
print("web-line S1 LC1: V kN", round(V / 1e3, 3), "M kNm", round(M / 1e6, 4),
      "flex DCR", round(flex, 4), "weld DCR", round(f / cap, 4),
      "H kN", round(H / 1e3, 3), "WLY kN", round(wly / 1e3, 2), "WCr kN", round(wcr / 1e3, 2),
      "column DCR", round(max(H / wly, H / wcr), 4))

# ----------------------------------------------- DG1 3rd Ed. Example 4.7-7 (US)
Nu_rod, s_rods, t_web, t_bp, Fy50 = 17.3, 6.5, 0.5, 1.75, 50.0
a = (s_rods - t_web) / 2
be = 2 * a
Mr = Nu_rod * a
phiMn = 0.9 * Fy50 * be * t_bp ** 2 / 4
print("DG1 4.7-7: a", a, "be", be, "Mr kip-in", Mr, "phiMn", round(phiMn, 1),
      "tp_req in", round(sqrt(4 * Mr / be / (0.9 * Fy50)), 4))
w = 0.25
phiRn_rod = 0.75 * 0.6 * 70 * (w / sqrt(2)) * be * 1.5
print("DG1 4.7-7 weld per rod phiRn kips", round(phiRn_rod, 2), "x8 =", round(8 * phiRn_rod, 1),
      "DCR", round(Nu_rod / phiRn_rod, 4))
