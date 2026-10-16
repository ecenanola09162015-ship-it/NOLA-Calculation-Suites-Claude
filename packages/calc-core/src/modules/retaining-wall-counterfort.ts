/**
 * Counterfort (buttress) design for full-width walls (Phase 3).
 *
 * Each counterfort is a tapered T-beam cantilevered from the footing: the
 * stem is its compression flange (effective width ACI 318-19 Table 6.3.2.1),
 * the tension bars run along the inclined back edge. Loads are the FE line
 * reactions of the plate analysis (buttress = rigid line support), so the
 * share carried by the base and the end walls is already removed.
 *
 *  - Flexure: strain compatibility on the T section, d measured normal to the
 *    inclined tension face, d = D·cosα − cover − tie − db/2 (22.2, 22.3).
 *  - Shear: Vu,eff = Vu − (Mu/d)·tanα for a member deepening towards the
 *    support (R9.4.3†), Vc = 0.17λ√f′c bw d with Av ≥ Av,min (22.5.5.1(a),
 *    9.6.3.4), Vs from the horizontal ties, ≤ 0.66√f′c bw d (22.5.1.2).
 *  - Ties: horizontal stem → counterfort for the reaction intensity, vertical
 *    heel → counterfort for the net factored heel load × tributary width,
 *    φ = 0.90 direct tension (Table 21.2.1).
 *  - Heel between counterforts: continuous slab, wu·s²/12 at the supports, or
 *    wu·a²/2 for a free-end overhang, on the footing distribution bars.
 */
import { slabSqrtFc } from "./slab-design";

export interface TBeamStrength {
  phiMn: number;
  mn: number;
  phi: number;
  c: number;
  a: number;
  strain: number;
  tensionControlled: boolean;
  /** Compression block within the flange. */
  inFlange: boolean;
}

/** T-section with one layer of tension steel; N, mm. Returns kN·m. */
export function tBeamStrength(fc: number, fy: number, es: number, bf: number, hf: number, bw: number, as: number, d: number): TBeamStrength {
  const beta = Math.max(0.65, 0.85 - (0.05 * Math.max(0, fc - 28)) / 7);
  const comp = (a: number) => {
    if (a <= hf) return { area: bf * a, arm: a / 2 };
    const a1 = bf * hf,
      a2 = bw * (a - hf);
    return { area: a1 + a2, arm: (a1 * hf * 0.5 + a2 * (hf + (a - hf) / 2)) / (a1 + a2) };
  };
  const fs = (c: number) => Math.max(-fy, Math.min(fy, (es * 0.003 * (d - c)) / c));
  let lo = 1e-4,
    hi = d;
  for (let k = 0; k < 80; k++) {
    const c = (lo + hi) / 2;
    if (0.85 * fc * comp(beta * c).area > as * fs(c)) hi = c;
    else lo = c;
  }
  const c = (lo + hi) / 2,
    a = beta * c,
    cc = comp(a);
  const mn = (as * fs(c) * (d - cc.arm)) / 1e6;
  const strain = (0.003 * (d - c)) / c,
    ey = fy / es,
    phi = 0.65 + 0.25 * Math.max(0, Math.min(1, (strain - ey) / 0.003));
  return { phiMn: phi * mn, mn, phi, c, a, strain, tensionControlled: strain >= ey + 0.003 - 1e-10, inFlange: a <= hf + 1e-9 };
}

export interface CounterfortInput {
  fc: number;
  fy: number;
  es: number;
  /** Counterfort centreline from the left end, m; height above the footing, m; width bw, m. */
  x: number;
  height: number;
  width: number;
  /** Stem thickness at y above the footing, m. */
  stemThickness: (y: number) => number;
  /** Stem height H, m. */
  stemHeight: number;
  /** Horizontal reach behind the stem at the base (= heel) and at the top, m. */
  baseReach: number;
  topReach: number;
  cover: number;
  tension: { diameter: number; count: number };
  ties: { diameter: number; spacing: number };
  heelTies: { diameter: number; spacing: number };
  /** Clear spacing to the neighbouring counterforts or supported end walls (Infinity = free end), m. */
  clearLeft: number;
  clearRight: number;
  /** Tributary length of heel carried by this counterfort, m. */
  tributary: number;
  /** FE line reactions: node heights and factored nodal forces per strength combination (kN, towards the toe). */
  ys: number[];
  combos: { combo: string; force: number[] }[];
  /** Governing net downward factored heel load, kPa, and its combination. */
  heelNet: { combo: string; q: number } | null;
  footingThickness: number;
  footingCoverTop: number;
}

export interface CounterfortStation {
  y: number;
  /** Envelope over the strength combinations. */
  mu: number;
  vu: number;
  vuEff: number;
  d: number;
  bf: number;
  phiMn: number;
  phiVn: number;
  combo: string;
}

export interface CounterfortResult {
  index: number;
  x: number;
  height: number;
  bw: number;
  alpha: number;
  /** Total horizontal reaction (governing combination), kN. */
  reaction: number;
  baseMoment: number;
  stations: CounterfortStation[];
  flexure: { mu: number; phiMn: number; y: number; d: number; bf: number; strength: TBeamStrength; combo: string };
  shear: { vu: number; vuEff: number; phiVc: number; phiVs: number; phiVn: number; vsMax: number; y: number; d: number; combo: string };
  asMin: { required: number; provided: number; analysis: number; rule: number };
  avMin: { required: number; provided: number };
  /** Horizontal ties: peak reaction intensity, kN/m, vs φ fy Av per metre height. */
  ties: { demand: number; capacity: number; y: number; combo: string };
  /** Vertical heel ties: net heel load × tributary, kN/m, vs φ fy Av per metre of heel. */
  heelTies: { demand: number; capacity: number; combo: string } | null;
  /** Clear bar spacing in one layer across bw, mm, vs the minimum (25.2.1). */
  barSpacing: { clear: number; minimum: number };
  /** Hooked development of the tension bars into the footing, mm. */
  anchorage: { ldh: number; available: number };
}

export function designCounterfort(c: CounterfortInput, index: number): CounterfortResult {
  const hc = Math.min(c.height, c.stemHeight),
    bw = c.width * 1000,
    db = c.tension.diameter,
    as = c.tension.count * (Math.PI / 4) * db * db,
    dt = c.ties.diameter;
  const tanA = Math.max(0, (c.baseReach - c.topReach) / Math.max(hc, 1e-9)),
    alpha = Math.atan(tanA),
    cosA = Math.cos(alpha);
  const reach = (y: number) => c.baseReach + ((c.topReach - c.baseReach) * Math.min(y, hc)) / Math.max(hc, 1e-9);
  const depth = (y: number) => ((c.stemThickness(y) + reach(y)) * cosA) * 1000 - c.cover - dt - db / 2;
  const flange = (y: number) => {
    const hf = c.stemThickness(y) * 1000;
    const over = (clear: number) => Math.min(8 * hf, Number.isFinite(clear) ? (clear * 1000) / 2 : 8 * hf, (hc * 1000) / 8);
    return { bf: bw + over(c.clearLeft) + over(c.clearRight), hf };
  };
  const root = slabSqrtFc(c.fc);
  const legs = 2 * (Math.PI / 4) * dt * dt;
  // Moment and shear at height y from the nodal reactions above it.
  const actions = (force: number[], y: number) => {
    let m = 0,
      v = 0;
    c.ys.forEach((yj, j) => {
      if (yj > y + 1e-9) {
        m += force[j]! * (yj - y);
        v += force[j]!;
      }
    });
    return { m, v };
  };
  const yStations = [...new Set([0, ...c.ys.filter((y) => y < hc - 1e-9)])].sort((a, b) => a - b);
  const stations: CounterfortStation[] = yStations.map((y) => {
    const d = depth(y),
      f = flange(y);
    let mu = 0,
      vu = 0,
      vuEff = 0,
      combo = c.combos[0]?.combo ?? "";
    for (const k of c.combos) {
      const a = actions(k.force, y);
      const eff = Math.max(0, a.v - ((Math.max(0, a.m) * 1000) / d) * tanA);
      if (a.m > mu) {
        mu = a.m;
        combo = k.combo;
      }
      vu = Math.max(vu, a.v);
      vuEff = Math.max(vuEff, eff);
    }
    const st = tBeamStrength(c.fc, c.fy, c.es, f.bf, f.hf, bw, as, d);
    const vc = (0.17 * root * bw * d) / 1000,
      vs = Math.min((legs * c.fy * d) / c.ties.spacing / 1000, (0.66 * root * bw * d) / 1000);
    return { y, mu, vu, vuEff, d, bf: f.bf, phiMn: st.phiMn, phiVn: 0.75 * (vc + vs), combo };
  });
  const govM = stations.reduce((b, s) => (s.mu / Math.max(s.phiMn, 1e-9) > b.mu / Math.max(b.phiMn, 1e-9) ? s : b), stations[0]!);
  const govV = stations.reduce((b, s) => (s.vuEff / s.phiVn > b.vuEff / b.phiVn ? s : b), stations[0]!);
  const fM = flange(govM.y);
  const strength = tBeamStrength(c.fc, c.fy, c.es, fM.bf, fM.hf, bw, as, govM.d);
  let shearCombo = c.combos[0]?.combo ?? "";
  {
    let best = -1;
    for (const k of c.combos) {
      const a = actions(k.force, govV.y),
        eff = a.v - ((Math.max(0, a.m) * 1000) / govV.d) * tanA;
      if (eff > best) {
        best = eff;
        shearCombo = k.combo;
      }
    }
  }
  const vc = (0.17 * root * bw * govV.d) / 1000,
    vsRaw = (legs * c.fy * govV.d) / c.ties.spacing / 1000,
    vsMax = (0.66 * root * bw * govV.d) / 1000;
  // Totals for the governing flexure combination.
  const gov = c.combos.find((k) => k.combo === govM.combo) ?? c.combos[0];
  const reaction = gov ? gov.force.reduce((s, f, j) => s + (c.ys[j]! > 1e-9 ? f : 0), 0) : 0;
  const baseMoment = gov ? actions(gov.force, 0).m : 0;
  // Horizontal ties: reaction intensity per metre height.
  let tie = { demand: 0, y: 0, combo: "" };
  for (const k of c.combos)
    c.ys.forEach((y, j) => {
      if (y <= 1e-9) return;
      const prev = c.ys[j - 1] ?? 0,
        next = j + 1 < c.ys.length ? Math.min(c.ys[j + 1]!, hc) : y,
        trib = (next - prev) / 2;
      const q = trib > 0 ? k.force[j]! / trib : 0;
      if (q > tie.demand) tie = { demand: q, y, combo: k.combo };
    });
  const tieCap = (0.9 * c.fy * legs * (1000 / c.ties.spacing)) / 1000;
  const heelLegs = 2 * (Math.PI / 4) * c.heelTies.diameter ** 2;
  const heelTies = c.heelNet
    ? { demand: Math.max(0, c.heelNet.q) * c.tributary, capacity: (0.9 * c.fy * heelLegs * (1000 / c.heelTies.spacing)) / 1000, combo: c.heelNet.combo }
    : null;
  // Detailing.
  // 9.6.1.2, relaxed to 4/3 of the steel required by analysis (9.6.1.3).
  const asMin9612 = Math.max((0.25 * Math.sqrt(c.fc)) / c.fy, 1.4 / c.fy) * bw * govM.d;
  let lo = 0,
    hi = asMin9612 * 4;
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    if (tBeamStrength(c.fc, c.fy, c.es, govM.bf, fM.hf, bw, m, govM.d).phiMn < govM.mu) lo = m;
    else hi = m;
  }
  const asRequired = hi,
    asMin = Math.min(asMin9612, (4 / 3) * asRequired);
  const avMin = Math.max((0.062 * Math.sqrt(c.fc) * bw) / c.fy, (0.35 * bw) / c.fy); // mm²/mm
  const clear = c.tension.count > 1 ? (bw - 2 * (c.cover + dt) - c.tension.count * db) / (c.tension.count - 1) : Infinity;
  const psiC = c.fc < 40 ? c.fc / 105 + 0.6 : 1;
  const ldh = Math.max(((c.fy * 1.6 * psiC) / (23 * root)) * db ** 1.5, 8 * db, 150);
  return {
    index,
    x: c.x,
    height: hc,
    bw,
    alpha,
    reaction,
    baseMoment,
    stations,
    flexure: { mu: govM.mu, phiMn: govM.phiMn, y: govM.y, d: govM.d, bf: govM.bf, strength, combo: govM.combo },
    shear: { vu: govV.vu, vuEff: govV.vuEff, phiVc: 0.75 * vc, phiVs: 0.75 * Math.min(vsRaw, vsMax), phiVn: govV.phiVn, vsMax, y: govV.y, d: govV.d, combo: shearCombo },
    asMin: { required: asMin, provided: as, analysis: asRequired, rule: asMin9612 },
    avMin: { required: avMin * c.ties.spacing, provided: legs },
    ties: { demand: tie.demand, capacity: tieCap, y: tie.y, combo: tie.combo },
    heelTies,
    barSpacing: { clear, minimum: Math.max(25, db) },
    anchorage: { ldh, available: c.footingThickness * 1000 - c.footingCoverTop },
  };
}

/** Heel slab spanning between counterforts (continuous) or overhanging a free end. */
export function heelBetweenCounterforts(q: number, interiorClear: number, overhang: number) {
  const interior = (q * interiorClear * interiorClear) / 12,
    end = (q * overhang * overhang) / 2;
  return end > interior ? { mu: end, case: `free-end overhang a = ${overhang.toFixed(2)} m, wu·a²/2` } : { mu: interior, case: `clear span s = ${interiorClear.toFixed(2)} m, wu·s²/12` };
}
