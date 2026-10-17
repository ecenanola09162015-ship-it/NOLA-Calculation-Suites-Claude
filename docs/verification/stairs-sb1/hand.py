"""Independent ACI 318-19 hand calculation for the stairs benchmark.

Frame: force method (virtual work, numerical integration) on the centreline
geometry, written without reference to the module's stiffness solver.
"""
import json, math, os
import numpy as np

# ---------------- inputs
fc, fy, Es, gc = 27.6, 414.0, 200000.0, 24.0
R, T, t, tl = 2000 / 13, 340.0, 200.0, 200.0
n1 = n2 = 13
Lland = 1460.0
B = 1800.0
cover = 20.0
SDL, LL = 1.0, 4.8
bearing = 250.0
combos = [("LC1", 1.2, 1.6), ("LC2", 1.4, 0.0)]
bars = dict(B1=(12, 150), T2=(12, 300), T3=(12, 200), T1=(12, 300), D1=(10, 200))
ftg = dict(B=600.0, h=300.0, soil=700.0, gs=18.0, mu=0.45, qa=150.0, cover=75.0, bar=(12, 200))

tan = R / T
th = math.atan(tan)
cos, sin = math.cos(th), math.sin(th)
Ec = 4700 * math.sqrt(fc)  # MPa, 19.2.2.1(b)

# ---------------- loads on plan, kPa (per metre strip)
w_waist = gc * t / 1000 / cos
w_steps = gc * R / 1000 / 2
wD_flight = w_waist + w_steps + SDL
wD_land = gc * tl / 1000 + SDL

off = (t / (2 * cos) - tl / 2) / tan  # knee offset beyond the riser line


def strip_geometry(k):
    """pieces [(x0,y0,x1,y1,h)], supports [(x,y,kind)], plan-load regions [(x0,x1,wD)]"""
    if k == 1:
        y0 = -t / (2 * cos)
        knee = (n1 * T + off, n1 * R - tl / 2)
        xe = (n1 - 1) * T
        xE = xe + Lland
        pieces = [(0.0, y0, *knee, t), (*knee, xE, knee[1], tl)]
        sup = [(0.0, y0, "pin"), (xE, knee[1], "pin")]
        reg = [(0.0, xe, wD_flight), (xe, xE, wD_land)]
    else:
        base = n1 * R
        xa = Lland
        knee = (xa + off, base - tl / 2)
        xE = xa + n2 * T
        yE = base + n2 * R - t / (2 * cos)
        pieces = [(0.0, base - tl / 2, *knee, tl), (*knee, xE, yE, t)]
        sup = [(0.0, base - tl / 2, "pin"), (xE, yE, "fixed")]
        reg = [(0.0, xa, wD_land), (xa, xE, wD_flight)]
    return pieces, sup, reg


def discretise(pieces, n=3000):
    P = []
    for pi, (x0, y0, x1, y1, h) in enumerate(pieces):
        L = math.hypot(x1 - x0, y1 - y0)
        c, s = (x1 - x0) / L, (y1 - y0) / L
        for j in range(n):
            r = (j + 0.5) / n
            P.append((x0 + r * (x1 - x0), y0 + r * (y1 - y0), L / n, (x1 - x0) / n, c, s, h, pi))
    a = np.array(P)
    return dict(x=a[:, 0], y=a[:, 1], ds=a[:, 2], dx=a[:, 3], c=a[:, 4], s=a[:, 5], h=a[:, 6], piece=a[:, 7])


def plan_q(reg, x, case):
    q = np.zeros_like(x)
    for x0, x1, wd in reg:
        m = (x >= x0) & (x < x1 + 1e-9)
        q[m] = wd if case == "D" else LL
    return q


def internal(pts, loads_x, loads_W, forces, at_x, at_y, at_c, at_s):
    """M (sagging +), N (tension +), V at evaluation points from the left free body.
    loads: downward W at x (on the centreline); forces: [(x,y,Fx,Fy,Mz)] support forces."""
    M = np.zeros_like(at_x); Fx = np.zeros_like(at_x); Fy = np.zeros_like(at_x)
    for xs, ys, fx, fy, mz in forces:
        left = xs <= at_x + 1e-9
        M += np.where(left, (at_x - xs) * fy - (at_y - ys) * fx - mz, 0)
        Fx += np.where(left, fx, 0); Fy += np.where(left, fy, 0)
    order = np.argsort(loads_x)
    lx, lw = loads_x[order], loads_W[order]
    cq, cs = np.concatenate([[0], np.cumsum(lw)]), np.concatenate([[0], np.cumsum(lw * lx)])
    idx = np.searchsorted(lx, at_x, side="left")
    Q, S = cq[idx], cs[idx]
    M -= at_x * Q - S
    Fy -= Q
    N = -(Fx * at_c + Fy * at_s)
    V = Fx * (-at_s) + Fy * at_c
    return M, N, V


def solve_strip(k, case, model, ei_ratio=1.0):
    pieces, sup, reg = strip_geometry(k)
    p = discretise(pieces)
    EI = Ec * 1000 * p["h"] ** 3 / 12 * ei_ratio  # N·mm²/mm-width → consistent: use kN, m below
    # convert to kN·m² per m width: Ec[MPa=N/mm²]*I[mm^4/m] -> N·mm²  /1e9 -> kN·m²
    EI = EI * 1000 / 1e12  # (per metre width) kN·m²
    EA = Ec * p["h"] * 1000 / 1000  # kN per m width (MPa*mm²/1000)
    x, y, ds = p["x"] / 1000, p["y"] / 1000, p["ds"] / 1000
    (x0, y0, _), (xE, yE, kindE) = [(a / 1000, b / 1000, c) for a, b, c in sup]
    L = xE - x0
    q = plan_q(reg, p["x"], case) if case in ("D", "L") else np.zeros_like(x)
    W = q * p["dx"] / 1000  # kN per m width, downward
    # primary: pin at 0 (ux,uy), roller (uy) at E
    VE = np.sum(W * (x - x0)) / L
    V0 = np.sum(W) - VE
    f0 = [(x0, y0, 0.0, V0, 0.0), (xE, yE, 0.0, VE, 0.0)]

    def ev(forces, Wl):
        return internal(p, x, Wl, forces, x, y, p["c"], p["s"])

    M0, N0, _ = ev(f0, W)
    zero = np.zeros_like(x)
    # redundants
    red = []
    if model == "restrained":  # horizontal force at E (+x on structure)
        red.append([(x0, y0, -1.0, -(yE - y0) / L, 0.0), (xE, yE, 1.0, (yE - y0) / L, 0.0)])
    if kindE == "fixed":  # couple at E (ccw +)
        red.append([(x0, y0, 0.0, 1 / L, 0.0), (xE, yE, 0.0, -1 / L, 0.0)])
    ms = [ev(f, zero)[:2] for f in red]

    def dot(a, b):
        return np.sum(a[0] * b[0] / EI * ds) + np.sum(a[1] * b[1] / EA * ds)

    X = np.zeros(len(red))
    if red:
        F = np.array([[dot(mi, mj) for mj in ms] for mi in ms])
        d0 = np.array([dot(mi, (M0, N0)) for mi in ms])
        X = np.linalg.solve(F, -d0)
    forces = [list(f) for f in f0]
    for xi, f in zip(X, red):
        for a, b in zip(forces, f):
            for j in (2, 3, 4):
                a[j] += xi * b[j]
    M, N, V = ev(forces, W)
    # couple at E acts on the structure; internal moment just left of E includes it
    # (left free body never reaches E's couple because E is the last point) -> M at E end:
    react = [dict(x=f[0], rx=f[2], ry=f[3], mz=f[4]) for f in forces]
    return dict(p=p, x=x, y=y, ds=ds, M=M, N=N, V=V, EI=EI, EA=EA, react=react, forces=forces, X=X,
                L=L, x0=x0, y0=y0, xE=xE, yE=yE)


def deflection(k, case, model, ei_ratio, xs_eval):
    s = solve_strip(k, case, model, ei_ratio)
    x, y, ds = s["x"], s["y"], s["ds"]
    out = []
    p = s["p"]
    for xk in xs_eval:
        # unit downward load at xk on the primary structure
        yk = np.interp(xk, x, y)
        VE = (xk - s["x0"]) / s["L"]; V0 = 1 - VE
        f = [(s["x0"], s["y0"], 0, V0, 0), (s["xE"], s["yE"], 0, VE, 0)]
        m, nn, _ = internal(p, np.array([xk]), np.array([1.0]), f, x, y, p["c"], p["s"])
        out.append(np.sum(s["M"] * m / s["EI"] * ds) + np.sum(s["N"] * nn / s["EA"] * ds))
    return np.array(out) * 1000  # mm


# ---------------- section capacities
def flexure(As, d):
    beta = 0.85 if fc <= 28 else max(0.65, 0.85 - 0.05 * (fc - 28) / 7)
    a = As * fy / (0.85 * fc * 1000)
    c = a / beta
    et = 0.003 * (d - c) / c
    ety = fy / Es
    phi = 0.65 + 0.25 * min(1, max(0, (et - ety) / 0.003))
    Mn = As * fy * (d - a / 2) / 1e6
    return dict(a=a, c=c, et=et, phi=phi, Mn=Mn, phiMn=phi * Mn)


def vc(As, d, h, Nu_t=0.0):
    ls = min(1, math.sqrt(2 / (1 + 0.004 * d)))
    rho = As / (1000 * d)
    rt = min(math.sqrt(fc), 8.3)
    stress = 0.66 * ls * rho ** (1 / 3) * rt - Nu_t * 1000 / (6 * 1000 * h)
    stress = max(0, min(stress, 0.42 * rt))
    return dict(ls=ls, rho=rho, Vc=stress * d, phiVc=0.75 * stress * d)


area = lambda db, s: math.pi * db ** 2 / 4 * 1000 / s
d_main = t - cover - 12 / 2

res = {"loads": dict(waist=w_waist, steps=w_steps, flight=wD_flight, landing=wD_land, theta=math.degrees(th),
                     off=off)}

for k in (1, 2):
    models = ["restrained", "released"]
    sol = {(m, c): solve_strip(k, c, m) for m in models for c in ("D", "L")}
    base = sol[("restrained", "D")]
    p, x = base["p"], base["x"]
    fac = {}
    mpos = np.full_like(x, -1e9); mneg = np.full_like(x, 1e9); vu = np.zeros_like(x); mserv = np.zeros_like(x)
    nT = np.full_like(x, -1e9)
    for m in models:
        D, Lc = sol[(m, "D")], sol[(m, "L")]
        ms = D["M"] + Lc["M"]
        mserv = np.where(np.abs(ms) > np.abs(mserv), ms, mserv)
        for cid, a, b in combos:
            M = a * D["M"] + b * Lc["M"]; V = a * D["V"] + b * Lc["V"]; N = a * D["N"] + b * Lc["N"]
            mpos = np.maximum(mpos, M); mneg = np.minimum(mneg, M); vu = np.maximum(vu, np.abs(V)); nT = np.maximum(nT, N)
    mpos = np.maximum(mpos, 0); mneg = np.minimum(mneg, 0)
    pieces, sup, reg = strip_geometry(k)
    out = dict(geometry=dict(pieces=pieces, supports=sup, regions=reg))
    # reactions
    reacts = []
    for j in range(2):
        pick = max(models, key=lambda m: sol[(m, "D")]["react"][j]["ry"] + sol[(m, "L")]["react"][j]["ry"])
        rd, rl = sol[(pick, "D")]["react"][j], sol[(pick, "L")]["react"][j]
        vmax, vmin, hmax, mmax = -1e9, 1e9, 0, 0
        for m in models:
            for cid, a, b in combos:
                fd, fl = sol[(m, "D")]["react"][j], sol[(m, "L")]["react"][j]
                v = a * fd["ry"] + b * fl["ry"]
                vmax, vmin = max(vmax, v), min(vmin, v)
                hmax = max(hmax, abs(a * fd["rx"] + b * fl["rx"]))
                mmax = max(mmax, abs(a * fd["mz"] + b * fl["mz"]))
        reacts.append(dict(pick=pick, dead=rd, live=rl, vMax=vmax, vMin=vmin, hAbsMax=hmax, mAbsMax=mmax,
                           HserviceRestrained=sol[("restrained", "D")]["react"][j]["rx"] + sol[("restrained", "L")]["react"][j]["rx"]))
    out["reactions"] = reacts
    # moments per piece
    pcs = []
    for pi in range(2):
        mk = p["piece"] == pi
        i1 = np.argmax(np.where(mk, mpos, -1)); i2 = np.argmin(np.where(mk, mneg, 1))
        pcs.append(dict(mpos=float(mpos[i1]), x_mpos=float(p["x"][i1]), mneg=float(mneg[i2]), x_mneg=float(p["x"][i2])))
    out["pieces"] = pcs
    # end moment at fixed support (factored |M|)
    out["Mneg_end"] = float(mneg[-1])
    # shear outside support zones (bearing/2 + d)
    zone = bearing / 2 + d_main
    xs_sup = [s_[0] for s_ in sup]
    okz = np.ones_like(x, dtype=bool)
    for xs_ in xs_sup:
        okz &= np.abs(p["x"] - xs_) >= zone
    iv = np.argmax(np.where(okz, vu, -1))
    out["shear"] = dict(vu=float(vu[iv]), x=float(p["x"][iv]))
    out["nT_max"] = float(nT.max())
    # service governing moment (deflection)
    ig = np.argmax(mserv)
    Ma = float(mserv[ig])
    As = area(*bars["B1"])
    n = Es / Ec
    b = 1000
    nas = n * As
    xcr = (-nas + math.sqrt(nas ** 2 + 2 * b * nas * d_main)) / b
    Icr = b * xcr ** 3 / 3 + nas * (d_main - xcr) ** 2
    Ig = b * t ** 3 / 12
    fr = 0.62 * math.sqrt(fc)
    Mcr = fr * Ig / (t / 2) / 1e6
    Ie = Ig if Ma <= 2 / 3 * Mcr else min(Ig, Icr / (1 - ((2 / 3) * Mcr / Ma) ** 2 * (1 - Icr / Ig)))
    ratio = Ie / Ig
    xs_eval = np.linspace(base["x0"] + 0.05, base["xE"] - 0.05, 111)
    dl = {(m, c): deflection(k, c, m, ratio, xs_eval) for m in models for c in ("D", "L")}
    live = max(dl[(m, "L")].max() for m in models)
    total = max((2 * dl[(m, "D")] + dl[(m, "L")]).max() for m in models)
    Ldev = sum(math.hypot(a[2] - a[0], a[3] - a[1]) for a in pieces)
    out["deflection"] = dict(Ma=Ma, x_Ma=float(p["x"][ig]), Mcr=Mcr, Icr=Icr, Ig=Ig, n=n, xcr=xcr, ratio=ratio,
                             live=float(live), total=float(total),
                             lim_live=(base["xE"] - base["x0"]) * 1000 / 360, lim_total=(base["xE"] - base["x0"]) * 1000 / 240)
    ends = 0 if k == 1 else 1
    fyf = 0.4 + fy / 700
    out["hmin"] = dict(Ldev=Ldev, ends=ends, div=[20, 24, 28][ends], factor=fyf, hmin=Ldev / [20, 24, 28][ends] * fyf)
    out["stations"] = dict(x=p["x"][::50].tolist(), mpos=mpos[::50].tolist(), mneg=mneg[::50].tolist(), vu=vu[::50].tolist())
    out["Xred"] = {f"{m}/{c}": sol[(m, c)]["X"].tolist() for m in models for c in ("D", "L")}
    res[f"strip{k}"] = out

# sections
res["sections"] = {}
for key in ("B1", "T1", "T2", "T3"):
    db, s = bars[key]
    As = area(db, s)
    res["sections"][key] = dict(As=As, d=t - cover - db / 2, **flexure(As, t - cover - db / 2), **{"v_" + kk: vv for kk, vv in vc(As, t - cover - db / 2, t).items()})
rho_min = 0.0020 if fy < 420 else max(0.0018 * 420 / fy, 0.0014)
fs = 2 / 3 * fy
res["detailing"] = dict(rho_min=rho_min, As_min=rho_min * 1000 * t, smax_main=min(3 * t, 450), smax_dist=min(5 * t, 450),
                        s_crack=min(380 * 280 / fs - 2.5 * cover, 300 * 280 / fs), fs=fs)
rt = min(math.sqrt(fc), 8.3)


def ld(db, s, cov, top):
    cb = min(cov + db / 2, s / 2)
    return max(300, fy * (1.3 if top else 1) * (0.8 if db <= 19 else 1) * 1.0 / (1.1 * rt * min(2.5, cb / db)) * db)


psic = fc / 105 + 0.6 if fc < 40 else 1
ldh = max(fy * 1.6 * 1.25 * psic / (23 * rt) * 12 ** 1.5, 8 * 12, 150)
res["development"] = dict(ld_B1=ld(12, 150, cover, False), ld_T3=ld(12, 200, cover, False), ld_T2_top=ld(12, 300, cover, True), ldh12=ldh, psic=psic)

# footing (pinned bottom, M = 0)
r0 = res["strip1"]["reactions"][0]
Ps = r0["dead"]["ry"] + r0["live"]["ry"]
Hs = r0["dead"]["rx"] + r0["live"]["rx"]
Bf, hf = ftg["B"] / 1000, ftg["h"] / 1000
wF = gc * Bf * hf
wS = ftg["gs"] * ftg["soil"] / 1000 * (Bf - bearing / 1000)
P = Ps + wF + wS
e = abs(Hs * hf) / P
qmax = P / Bf * (1 + 6 * e / Bf) if e <= Bf / 6 else (2 * P / (3 * (Bf / 2 - e)) if e < Bf / 2 else math.inf)
Fs = ftg["mu"] * P / abs(Hs) if abs(Hs) > 1e-9 else None
ru = r0["vMax"]; eu = r0["hAbsMax"] * hf / ru
qu = ru / Bf * (1 + 6 * eu / Bf) if eu <= Bf / 6 else (2 * ru / (3 * (Bf / 2 - eu)) if eu < Bf / 2 else math.inf)
cft = (ftg["B"] - bearing) / 2
dft = ftg["h"] - ftg["cover"] - 6
Asf = area(12, 200)
res["footing"] = dict(Pservice_stair=Ps, Hservice=Hs, wF=wF, wS=wS, P=P, e=e, B6=Bf / 6, qmax=qmax, Fs=Fs, ru=ru, eu=eu, qu=qu,
                      c=cft, d=dft, phiMn=flexure(Asf, dft)["phiMn"], phiVc=vc(Asf, dft, ftg["h"])["phiVc"],
                      Asmin=rho_min * 1000 * ftg["h"], dowel_avail=ftg["h"] - ftg["cover"] - 12, ldh=ldh,
                      # released-at-footing alternative (thrust carried by the landing beam)
                      )
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand.json"), "w"), indent=1, default=float)
for k in ("loads", "sections", "detailing", "development", "footing"):
    print(k, res[k])
for k in (1, 2):
    s = res[f"strip{k}"]
    print(f"strip{k}", s["reactions"], s["pieces"], s["shear"], s["deflection"], s["hmin"], s["Xred"], s["Mneg_end"], s["nT_max"], sep="\n ")
