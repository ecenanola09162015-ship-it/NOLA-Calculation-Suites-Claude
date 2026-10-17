"""Independent hand-calculation reference for the Base Plate engine tests.

Pure Python (no app code). Values printed here are hard-coded into
packages/calc-core/test/base-plate.test.ts with the clause they verify.
AISC 360-22 J8, AISC DG1 3rd Ed. Ch. 4, ACI 318-19 Ch. 17 (SI).
"""
from math import sqrt, hypot, pi

# Case data: W12X40 (AISC v16.0: d 11.9 in, bf 8.01 in, tf 0.515 in, tw 0.295 in, in mm)
d, bf, tf, tw = 302.26, 203.454, 13.081, 7.493
Bx, By, Fy = 450.0, 500.0, 248.0
Px, Py, ha, fc = 750.0, 800.0, 900.0, 27.6

# --- J8 bearing
A1 = Bx * By
s = min(Px / Bx, Py / By)
A2 = A1 * s * s
fpmax = 0.65 * 0.85 * fc * min(sqrt(A2 / A1), 2)
phiPp = fpmax * A1
print("fpmax", fpmax, "phiPp_kN", phiPp / 1e3)

# --- DG1 axial (Pu = 900 kN)
Pu = 900e3
m = (By - 0.95 * d) / 2
n = (Bx - 0.8 * bf) / 2
X = 4 * d * bf / (d + bf) ** 2 * Pu / phiPp
lam = min(1, 2 * sqrt(X) / (1 + sqrt(1 - X)))
lnp = lam * sqrt(d * bf) / 4
l = max(m, n, lnp)
tp_axial = l * sqrt(2 * Pu / (0.9 * Fy * Bx * By))
print("m", m, "n", n, "X", X, "lambda", lam, "lnp", lnp, "tp_axial", tp_axial)

# --- DG1 small moment (Pu 400 kN, Mx 60 kN·m about X → along By)
P, M = 400e3, 60e6
e = M / P
q = fpmax * Bx
ecrit = By / 2 - P / (2 * q)
Y = By - 2 * e
fp = P / (Y * Bx)
L = max(m, n)
mpl = fp * L * L / 2 if Y >= L else fp * Y * (L - Y / 2)
tp_small = sqrt(4 * mpl / (0.9 * Fy))
print("small e", e, "ecrit", ecrit, "Y", Y, "fp", fp, "tp", tp_small)

# --- DG1 large moment (Pu 150 kN, Mx 90 kN·m), rods at y = ±195, x = ±170
P, M = 150e3, 90e6
e = M / P
f = 195.0
k = f + By / 2
disc = k * k - 2 * P * (e + f) / q
Y = k - sqrt(disc)
Tu = q * Y - P
mpl_b = fpmax * L * L / 2 if Y >= L else fpmax * Y * (L - Y / 2)
tp_b = sqrt(4 * mpl_b / (0.9 * Fy))
x = f - d / 2 + tf / 2
beff = Bx  # DG1 Eq. 4-60/4-62: full plate width B (engine 0.4.0, decision D1)
tp_t = sqrt(4 * Tu * x / beff / (0.9 * Fy))
print("large ecrit", By / 2 - P / (2 * q), "Y", Y, "Tu_kN", Tu / 1e3, "tp_bearing", tp_b, "x", x, "beff", beff, "tp_tension", tp_t)

# --- ACI 17.6.2 breakout of the 2 tension rods (x = ±170, y = −195), hef 300
hef = 300.0
edges = [Px / 2 - 170, Px / 2 - 170, Py / 2 - 195, Py / 2 + 195]
near = [c for c in edges if c < 1.5 * hef]
h = min(hef, max(max(near) / 1.5, 340 / 3)) if len(near) >= 3 else hef
c15 = 1.5 * h
ANc = (min(edges[0], c15) + 340 + min(edges[1], c15)) * (min(edges[2], c15) + min(edges[3], c15))
ANco = 9 * h * h
Nb = 10 * 1.0 * sqrt(fc) * h ** 1.5
camin = min(edges)
psied = 1 if camin >= c15 else 0.7 + 0.3 * camin / c15
Ncbg = ANc / ANco * psied * Nb
print("h'ef", h, "ANc", ANc, "ANco", ANco, "Nb", Nb, "psied", psied, "Ncbg_kN", Ncbg / 1e3, "phi", 0.7 * Ncbg / 1e3)

# --- ACI 17.6.3 pullout, 3/4 in heavy hex nut
da = 19.05
F = 1.5 * da + 3.175
Abrg = sqrt(3) / 2 * F * F - pi / 4 * da * da
Np = 8 * Abrg * fc
print("Abrg", Abrg, "Np_kN", Np / 1e3, "phiNpn", 0.7 * Np / 1e3)

# --- ACI 17.6.1 / 17.7.1 steel, F1554 Gr 36, 3/4 in (10 UNC)
Ase = pi / 4 * (0.75 - 0.9743 / 10) ** 2 * 25.4 ** 2
futa = min(399.9, 1.9 * 248.2, 860)
print("Ase", Ase, "phiNsa", 0.75 * Ase * futa / 1e3, "phiVsa_grout", 0.65 * 0.6 * Ase * futa * 0.8 / 1e3)

# --- ACI 17.7.2 shear breakout towards +X, farthest row (x = −170), 2 rods at y = ±195
ca1 = Px / 2 + 170
c2a = c2b = Py / 2 - 195
span = 390
c15v = 1.5 * ca1
narrow = c2a < c15v and c2b < c15v and ha < c15v
ca1u = min(ca1, max(max(c2a, c2b) / 1.5, ha / 1.5, span / 3)) if narrow else ca1
c15v = 1.5 * ca1u
AVc = (min(c2a, c15v) + span + min(c2b, c15v)) * min(c15v, ha)
AVco = 4.5 * ca1u ** 2
le = min(hef, 8 * da)
Vb = min(0.6 * (le / da) ** 0.2 * sqrt(da) * sqrt(fc) * ca1u ** 1.5, 3.7 * sqrt(fc) * ca1u ** 1.5)
psiedv = 1 if min(c2a, c2b) >= c15v else 0.7 + 0.3 * min(c2a, c2b) / c15v
psih = max(1, sqrt(c15v / ha))
Vcbg = min(AVc, 2 * AVco) / AVco * psiedv * psih * Vb
print("ca1", ca1, "narrow", narrow, "AVc", AVc, "AVco", AVco, "Vb", Vb, "psied", psiedv, "Vcbg_kN", Vcbg / 1e3, "phi", 0.7 * Vcbg / 1e3)

# --- Adhesive bond, single rod far from edges: da 16, hef 150, tau_cr 1.4, tau_uncr 4.5
da, hef, tcr, tun = 16.0, 150.0, 1.4, 4.5
cna = 10 * da * sqrt(tun / 7.6)
Nba = 1.0 * tcr * pi * da * hef
print("cNa", cna, "Nba_kN", Nba / 1e3)

# --- ASD (AISC 360-22 B3.2): same bench case, Pa = 600 kN axial
fpa = 0.85 * fc * min(sqrt(A2 / A1), 2) / 2.31
Ppa = fpa * A1
Pa = 600e3
X = 4 * d * bf / (d + bf) ** 2 * Pa / Ppa
lam = min(1, 2 * sqrt(X) / (1 + sqrt(1 - X)))
l = max(m, n, lam * sqrt(d * bf) / 4)
tp_asd = l * sqrt(2 * Pa * 1.67 / (Fy * Bx * By))
print("ASD fp_avail", fpa, "tp_asd", tp_asd, "weld_avail_8mm", 0.6 * 482 * 0.7071 * 8 / 2.0)
# --- Built-up I 400 x 200 x 12 x 8
bd, bb, bt, bw = 400, 200, 12, 8
hw = bd - 2 * bt
print("BU-I A", 2 * bb * bt + hw * bw, "Ix", (bb * bd**3 - (bb - bw) * hw**3) / 12, "Iy", (2 * bt * bb**3 + hw * bw**3) / 12)
