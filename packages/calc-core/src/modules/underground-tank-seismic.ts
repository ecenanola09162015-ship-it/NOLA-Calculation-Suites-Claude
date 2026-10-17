/**
 * Seismic loads on rectangular liquid-containing tanks (Type 1), ACI 350.3-20.
 *
 * Equation numbers are ACI 350.3-20. One direction of ground motion at a
 * time: L is the inside dimension parallel to the motion, B perpendicular.
 *  - Effective weights 9.2.1, heights EBP 9.2.2 and IBP 9.2.3, ε 9.6.1.
 *  - Ti: rigid wall (Ci = SDS) under a roof, or the cantilever stiffness of
 *    R9.2.4 for open tanks; Tc 9.2.4d–f; Ci, Cc 9.4.1–9.4.2, Ct = Ci 9.4.3b.
 *  - Forces 4.1.1a–e, vertical acceleration 4.1.4, dynamic earth pressure
 *    R8.1 (resultant at 0.6H), base shear 4.1.2, moments 4.1.3.
 *  - Wall pressures on the walls perpendicular to the motion: linear
 *    distributions of R5.3.1 for ½Pi and ½Pc, wall inertia uniform, vertical
 *    acceleration on the hydrostatic pressure, combined per 5.3.2.
 *  - Freeboard d_max = (L/2)·Cc·I (7.1a); roof uplift by R7.1 when the
 *    freeboard is inadequate.
 */
const G = 9.807;

export interface TankSeismicInput {
  sds: number;
  sd1: number;
  tl: number;
  importance: number;
  ri: number;
  rc: number;
  /** Vertical / horizontal acceleration ratio b (≥ 2/3 without a site-specific spectrum). */
  b: number;
  /** Concrete modulus, MPa, and unit weights, kN/m³. */
  ec: number;
  gammaC: number;
  gammaL: number;
  /** Inside dimensions: L parallel to the motion, B perpendicular; liquid depth HL; wall height Hw (clear), m. */
  L: number;
  B: number;
  hl: number;
  hw: number;
  tw: number;
  /** Total wall weight (all four walls) and roof weight incl. superimposed dead, kN; roof thickness, m. */
  wallWeight: number;
  roofWeight: number;
  roofThickness: number;
  roof: boolean;
  /** Buried height of the wall (soil against it), m; soil unit weights; groundwater present against the wall. */
  soilHeight: number;
  gammaSoil: number;
  gammaSat: number;
  gammaW: number;
  groundwater: boolean;
  yielding: boolean;
  /** Freeboard coefficient for the roof uplift (R7.1), 1.4–3.2. */
  clf: number;
}

export interface TankSeismicDirection {
  L: number;
  B: number;
  wl: number;
  wi: number;
  wc: number;
  hi: number;
  hc: number;
  hiIbp: number;
  hcIbp: number;
  eps: number;
  ti: number;
  tc: number;
  ci: number;
  cc: number;
  ct: number;
  uv: number;
  /** Forces, kN: all walls, one perpendicular wall, roof, impulsive, convective, dynamic earth (one wall). */
  pw: number;
  pwOne: number;
  pr: number;
  pi: number;
  pc: number;
  peg: number;
  v: number;
  mb: number;
  mo: number;
  dmax: number;
  freeboard: number;
  /** R7.1 confined fraction k_r (0 with adequate freeboard) and the impulsive height used. */
  kr: number;
  hiEff: number;
  /** Roof uplift pressure, kPa, over Li from each wall perpendicular to the motion (0 when the freeboard is adequate). */
  uplift: number;
  li: number;
  /** Outward hydrodynamic pressure on a wall perpendicular to the motion at height y, kPa (5.3.2, without static). */
  hydro: (y: number) => number;
  /** Inward dynamic earth pressure on the trailing wall at height y, kPa. */
  earth: (y: number) => number;
}

export const tankWiRatio = (r: number) => Math.tanh(0.866 * r) / (0.866 * r);
export const tankWcRatio = (r: number) => 0.264 * r * Math.tanh(3.16 / r);
export const tankHiRatio = (r: number) => (r < 1.333 ? 0.5 - 0.09375 * r : 0.375);
export const tankHcRatio = (r: number) => {
  const a = 3.16 / r;
  return 1 - (Math.cosh(a) - 1) / (a * Math.sinh(a));
};
export const tankHiIbpRatio = (r: number) => (r < 0.75 ? 0.45 : (0.866 * r) / (2 * Math.tanh(0.866 * r)) - 0.125);
export const tankHcIbpRatio = (r: number) => {
  const a = 3.16 / r;
  return 1 - (Math.cosh(a) - 2.01) / (a * Math.sinh(a));
};
export const tankEpsilon = (r: number) => Math.min(1, 0.0151 * r * r - 0.1908 * r + 1.021);
/** Convective period, s (9.2.4d–f). */
export const tankTc = (L: number, hl: number) => {
  const lambda = Math.sqrt(3.16 * G * Math.tanh((3.16 * hl) / L));
  return (2 * Math.PI) / (lambda / Math.sqrt(L));
};
export function tankCi(sds: number, sd1: number, ti: number) {
  const ts = sd1 / sds;
  return ti <= ts ? sds : Math.min(sds, sd1 / ti);
}
export function tankCc(sds: number, sd1: number, tc: number, tl: number) {
  return tc <= tl ? Math.min((1.5 * sd1) / tc, 1.5 * sds) : (1.5 * sd1 * tl) / (tc * tc);
}

/** R5.3.1 linear distribution per unit height of a resultant P/2 acting at height h over depth H. */
export function linearDistribution(half: number, H: number, h: number, y: number) {
  if (y < 0 || y > H) return 0;
  if (h < (2 / 3) * H - 1e-12) return Math.max(0, (half * (4 * H - 6 * h - (6 * H - 12 * h) * (y / H))) / (H * H));
  // h ≥ 2H/3: triangular from y = 3h − 2H, written for the half force.
  if (y <= 3 * h - 2 * H) return 0;
  return (2 * half * (y + 2 * H - 3 * h)) / (9 * (H - h) ** 2);
}

export function tankSeismicDirection(s: TankSeismicInput): TankSeismicDirection {
  const r = s.L / Math.max(s.hl, 1e-9),
    I = s.importance;
  const wl = s.gammaL * s.L * s.B * s.hl;
  const hasLiquid = s.hl > 1e-6;
  const wi = hasLiquid ? wl * tankWiRatio(r) : 0,
    wc = hasLiquid ? wl * tankWcRatio(r) : 0;
  const hi = hasLiquid ? s.hl * tankHiRatio(r) : 0,
    hc = hasLiquid ? s.hl * tankHcRatio(r) : 0,
    hiIbp = hasLiquid ? s.hl * tankHiIbpRatio(r) : 0,
    hcIbp = hasLiquid ? s.hl * tankHcIbpRatio(r) : 0;
  const eps = hasLiquid ? tankEpsilon(r) : 1;
  // Impulsive period: rigid under a roof (Ci = SDS); open-top cantilever (R9.2.4), SI with N, kg, m.
  let ti = 0;
  if (!s.roof) {
    const mw = (s.hw * s.tw * s.gammaC * 1000) / G,
      mi = hasLiquid ? ((wi / wl) * (s.L / 2) * s.hl * s.gammaL * 1000) / G : 0;
    const h = (0.5 * s.hw * mw + hi * mi) / (mw + mi);
    const k = ((s.ec * 1e6) / 4) * (s.tw / h) ** 3;
    ti = 2 * Math.PI * Math.sqrt((mw + mi) / k);
  }
  const tc = hasLiquid ? tankTc(s.L, s.hl) : Infinity;
  const ci = tankCi(s.sds, s.sd1, ti),
    cc = hasLiquid ? tankCc(s.sds, s.sd1, tc, s.tl) : 0,
    ct = ci;
  const uv = Math.max((ct * I * s.b) / s.ri, 0.2 * s.sds);
  const wOne = s.gammaC * (s.B + 2 * s.tw) * s.tw * s.hw;
  const dmax = hasLiquid ? (s.L / 2) * cc * I : 0;
  const freeboard = s.hw - s.hl;
  const over = s.roof && dmax > freeboard;
  // R7.1, rectangular tanks with inadequate freeboard: the confined convective mass becomes impulsive.
  const kr = over ? Math.acos(Math.max(-1, Math.min(1, freeboard / dmax))) / Math.PI : 0;
  const wiEff = (1 - kr) * wi + (hasLiquid ? kr * (s.hw / s.hl) * wl : 0);
  const miArm = (1 - kr) * wi * hi + (hasLiquid ? kr * (s.hw / s.hl) * wl * (s.hw / 2) : 0),
    miArmIbp = (1 - kr) * wi * hiIbp + (hasLiquid ? kr * (s.hw / s.hl) * wl * (s.hw / 2) : 0);
  const hiEff = wiEff > 0 ? miArm / wiEff : hi,
    hiEffIbp = wiEff > 0 ? miArmIbp / wiEff : hiIbp;
  const pw = (ci * I * eps * s.wallWeight) / s.ri,
    pwOne = (ci * I * eps * wOne) / s.ri,
    pr = s.roof ? (ci * I * s.roofWeight) / s.ri : 0,
    pi = (ci * I * wiEff) / s.ri,
    pc = ((1 - kr) * cc * I * wc) / s.rc;
  // R8.1: per unit width; groundwater factor k_hw = γs/γb (R8.1c, d).
  const hs = Math.max(0, Math.min(s.soilHeight, s.hw));
  const khw = s.groundwater ? s.gammaSat / Math.max(s.gammaSat - s.gammaW, 1e-9) : 1;
  const pegUnit = hs > 0 ? (s.yielding ? 3 / 8 : 1) * khw * (s.sds / 2.5) * s.gammaSoil * hs * hs * (I / s.ri) : 0;
  const peg = pegUnit * (s.B + 2 * s.tw);
  const heg = 0.6 * hs,
    hwc = s.hw / 2,
    hr = s.hw + s.roofThickness / 2;
  const v = Math.hypot(pi + pw + pr, pc, peg);
  const mb = Math.hypot(pi * hiEff + pw * hwc + pr * hr, pc * hc, peg * heg);
  const mo = Math.hypot(pi * hiEffIbp + pw * hwc + pr * hr, pc * hcIbp, peg * heg);
  const uplift = over ? Math.max(0, s.clf * s.gammaL * (dmax / I - freeboard)) : 0;
  const li = over ? (s.L / Math.PI) * Math.acos(Math.max(-1, Math.min(1, freeboard / dmax))) : 0;
  // Pressures per unit area on a wall perpendicular to the motion (width B).
  const pwy = (ci * I * eps * s.gammaC * s.tw) / s.ri;
  const hydro = (y: number) => {
    const piy = hasLiquid ? linearDistribution(pi / 2, s.hl, Math.min(hiEff, 0.9 * s.hl), y) / s.B : 0,
      pcy = hasLiquid ? linearDistribution(pc / 2, s.hl, hc, y) / s.B : 0,
      pvy = hasLiquid && y <= s.hl ? uv * s.gammaL * (s.hl - y) : 0;
    const w = y >= 0 && y <= s.hw ? pwy : 0;
    return Math.sqrt((piy + w) ** 2 + pcy ** 2 + pvy ** 2);
  };
  // Inverted trapezoid over the buried height 0…hs above the base (base 0.4F/H, top 1.6F/H): resultant at 0.6·hs.
  const earth = (y: number) => (hs > 0 && y >= 0 && y <= hs ? (pegUnit / hs) * (0.4 + (1.2 * y) / hs) : 0);
  return { L: s.L, B: s.B, wl, wi, wc, hi, hc, hiIbp, hcIbp, eps, ti, tc, ci, cc, ct, uv, pw, pwOne, pr, pi, pc, peg, v, mb, mo, dmax, freeboard, kr, hiEff, uplift, li, hydro, earth };
}
