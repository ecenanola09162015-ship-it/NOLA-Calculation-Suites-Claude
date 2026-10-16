/**
 * RC retaining wall design, 1 m strip (engine rwall-0.1.0).
 *
 * External stability uses service (ASD) combinations with factors of safety;
 * member design uses strength combinations (NSCP 2015 203.3 / ASCE 7-16 2.3,
 * H at 1.6 where it adds, ACI 318-19 5.3.8). Live surcharge acts on the
 * driving side only for overturning and sliding; bearing and the footing are
 * checked with and without its vertical part. Vertical soil weight is D.
 * The footing is designed from the factored bearing pressure of the factored
 * resultant. Flexure uses ACI strain compatibility (shared with the Slab
 * module); shear Table 22.5.5.1(c).
 */
import {
  slabFlexuralStrength,
  slabMinimumSteelRatio,
  slabSqrtFc,
} from "./slab-design";
import {
  RETAINING_WALL_ENGINE,
  barAreaPerMetre,
  type RetainingWallBar,
  type RetainingWallCombination,
  type RetainingWallInput,
} from "./retaining-wall";
import {
  clipPolygon,
  polygonProperties,
  retainingWallGeometry,
  stemThickness,
  type RetainingWallGeometry,
} from "./retaining-wall-geometry";
import {
  componentResultant,
  earthCoefficients,
  integrate,
  pressureComponents,
  type EarthCoefficients,
  type PressureComponent,
  type PressureKind,
} from "./retaining-wall-pressure";
import { solveStem, type StemSolution, type StemSupports } from "./retaining-wall-stem";
import { retainingWallClauses as clauses } from "../code-clauses";

export type LoadKind = "D" | "L" | "H" | "E";
export interface WeightItem {
  id: string;
  label: string;
  kind: LoadKind;
  /** kN/m (positive down). */
  weight: number;
  x: number;
  y: number;
  concrete: boolean;
}
export interface LateralItem {
  id: string;
  label: string;
  kind: LoadKind;
  /** Horizontal force, kN/m (positive towards the toe). */
  force: number;
  /** Height above the footing underside, m. */
  arm: number;
}
export interface StabilityCase {
  id: string;
  seismic: boolean;
  vertical: number;
  uplift: number;
  resisting: number;
  overturning: number;
  driving: number;
  slidingResistance: number;
  fsOverturning: number;
  fsSliding: number;
  fsOverturningRequired: number;
  fsSlidingRequired: number;
  /** Governing bearing variant (with or without live vertical). */
  bearing: BearingResult;
  allowable: number;
}
export interface BearingResult {
  /** Net vertical force on the soil, kN/m. */
  vertical: number;
  /** Resultant distance from the toe, m. */
  xr: number;
  /** Eccentricity from the base centre (+ towards the toe), m. */
  e: number;
  /** Pressure at the toe and heel edges, kPa (0 outside contact). */
  qToe: number;
  qHeel: number;
  qMax: number;
  /** Contact length from the loaded edge, m. */
  contact: number;
  /** "trapezoid" | "triangle" | "unstable" */
  shape: "trapezoid" | "triangle" | "unstable";
  /** Pressure at distance x from the toe, kPa. */
  at: (x: number) => number;
}
export interface MemberAction {
  combo: string;
  moment: number;
  shear: number;
}
export interface FlexureCheck {
  id: string;
  label: string;
  /** Factored moment demand (positive), kN·m/m. */
  mu: number;
  phiMn: number;
  as: number;
  d: number;
  phi: number;
  tensionControlled: boolean;
  combo: string;
  location: string;
}
export interface ShearCheck {
  id: string;
  label: string;
  vu: number;
  phiVc: number;
  d: number;
  lambdaS: number;
  combo: string;
  location: string;
}
export interface StemStation {
  y: number;
  t: number;
  /** Envelopes over strength combos (back tension ≥ 0, front tension ≤ 0). */
  mBack: number;
  mFront: number;
  v: number;
  phiMnBack: number;
  phiMnFront: number;
  /** Service (first service combo) moment for the diagram. */
  mService: number;
}
export interface RwCheck {
  id: string;
  group: "Stability" | "Stem" | "Footing" | "Detailing";
  label: string;
  demand: number;
  capacity: number;
  unit: string;
  dcr: number | null;
  detail: string;
  clause: string;
}
export interface RetainingWallResult {
  engine: typeof RETAINING_WALL_ENGINE;
  geometry: RetainingWallGeometry;
  coefficients: EarthCoefficients;
  weights: WeightItem[];
  lateral: LateralItem[];
  verticalThrust: WeightItem[];
  uplift: { force: number; x: number };
  passive: { force: number; arm: number; depth: number };
  stability: StabilityCase[] | null;
  stem: {
    components: { id: string; label: string; kind: PressureKind; base: number; force: number; arm: number }[];
    stations: StemStation[];
    /** Profile of each pressure component on the stem, kPa at y. */
    pressure: (id: string, y: number) => number;
    reactions: { combo: string; prop: number | null; top: number | null; topMoment: number | null; baseShear: number; baseMoment: number }[];
    serviceReactions: { combo: string; prop: number | null; top: number | null };
  };
  footing: {
    toe: MemberAction[];
    heel: MemberAction[];
    bearing: { combo: string; bearing: BearingResult }[];
  } | null;
  flexure: FlexureCheck[];
  shear: ShearCheck[];
  development: {
    ldh: number;
    available: number;
    ld: number;
    lap: number;
  };
  checks: RwCheck[];
  warnings: string[];
}

const kindFactor = (c: RetainingWallCombination, kind: LoadKind | PressureKind) =>
  kind === "D" ? c.d : kind === "H" ? c.h : kind === "L" ? c.l : c.e;

export function bearingPressure(B: number, V: number, moment: number): BearingResult {
  // moment = net moment about the toe of all loads (resisting − overturning).
  if (!(V > 0))
    return { vertical: V, xr: NaN, e: NaN, qToe: NaN, qHeel: NaN, qMax: Infinity, contact: 0, shape: "unstable", at: () => NaN };
  const xr = moment / V,
    e = B / 2 - xr;
  if (xr <= 0 || xr >= B)
    return { vertical: V, xr, e, qToe: NaN, qHeel: NaN, qMax: Infinity, contact: 0, shape: "unstable", at: () => NaN };
  if (Math.abs(e) <= B / 6 + 1e-12) {
    const qToe = (V / B) * (1 + (6 * e) / B),
      qHeel = (V / B) * (1 - (6 * e) / B);
    return {
      vertical: V, xr, e, qToe, qHeel, qMax: Math.max(qToe, qHeel), contact: B, shape: "trapezoid",
      at: (x) => qToe + ((qHeel - qToe) * x) / B,
    };
  }
  if (e > 0) {
    const a = 3 * xr,
      q = (2 * V) / a;
    return { vertical: V, xr, e, qToe: q, qHeel: 0, qMax: q, contact: a, shape: "triangle", at: (x) => (x <= a ? q * (1 - x / a) : 0) };
  }
  const a = 3 * (B - xr),
    q = (2 * V) / a;
  return { vertical: V, xr, e, qToe: 0, qHeel: q, qMax: q, contact: a, shape: "triangle", at: (x) => (x >= B - a ? q * (1 - (B - x) / a) : 0) };
}

const shearCapacity = (fc: number, as: number, d: number, sizeEffect: boolean) => {
  const rho = as / (1000 * d),
    lambdaS = sizeEffect ? Math.min(1, Math.sqrt(2 / (1 + 0.004 * d))) : 1,
    vc = Math.min(0.66 * lambdaS * Math.cbrt(rho), 0.42) * slabSqrtFc(fc) * 1000 * d / 1000;
  return { phiVc: 0.75 * vc, lambdaS };
};

const crackSpacing = (fy: number, clear: number) => {
  const fs = (2 / 3) * fy;
  return Math.min(380 * (280 / fs) - 2.5 * clear, 300 * (280 / fs));
};

export function designRetainingWall(i: RetainingWallInput): RetainingWallResult {
  const g = retainingWallGeometry(i);
  const coeff = earthCoefficients(i);
  const basement = i.wallType === "basement";
  const B = g.width,
    tf = i.footing,
    H = i.height,
    warnings: string[] = [];
  const seismicOn = i.seismic.method !== "none";

  // ---- Weights (per metre) ------------------------------------------------
  const weights: WeightItem[] = [];
  const addPoly = (id: string, label: string, kind: LoadKind, poly: { x: number; y: number }[] | null, unit: number, concrete: boolean) => {
    if (!poly || poly.length < 3) return;
    const p = polygonProperties(poly);
    if (p.area <= 1e-9) return;
    weights.push({ id, label, kind, weight: p.area * unit, x: p.cx, y: p.cy, concrete });
  };
  addPoly("stem", "Stem", "D", g.stem, i.concreteWeight, true);
  if (!basement) {
    addPoly("footing", "Footing", "D", g.footing, i.concreteWeight, true);
    addPoly("key", "Shear key", "D", g.key, i.concreteWeight, true);
    const hw = i.water.enabled ? i.water.back : 0;
    if (hw > tf) {
      addPoly("soilWet", "Backfill below water (γsat)", "D", clipPolygon(g.backfill, hw, "below"), i.soil.gammaSat, false);
      addPoly("soil", "Backfill above water", "D", clipPolygon(g.backfill, hw, "above"), i.soil.gamma, false);
    } else addPoly("soil", "Backfill over heel", "D", g.backfill, i.soil.gamma, false);
    if (i.toeSoil.includeWeight) addPoly("toeSoil", "Soil over toe", "D", g.toeSoil, i.toeSoil.gamma, false);
    const run = B - g.backTop;
    if (run > 1e-9) {
      if (i.surcharge.dead > 0)
        weights.push({ id: "qDead", label: "Dead surcharge over heel", kind: "D", weight: i.surcharge.dead * run, x: g.backTop + run / 2, y: g.heelGround, concrete: false });
      if (i.surcharge.live > 0)
        weights.push({ id: "qLive", label: "Live surcharge over heel", kind: "L", weight: i.surcharge.live * run, x: g.backTop + run / 2, y: g.heelGround, concrete: false });
    }
  }

  // ---- Lateral loads on the virtual back plane -----------------------------
  const plane = { height: g.virtualHeight, water: i.water.enabled ? i.water.back : 0 };
  const planeComps = basement ? [] : pressureComponents(i, coeff, plane);
  const lateral: LateralItem[] = [];
  const verticalThrust: WeightItem[] = [];
  for (const c of planeComps) {
    const r = componentResultant(c, plane.height);
    if (!Number.isFinite(r.force)) warnings.push("Mononobe-Okabe has no solution (φ − θ − β < 0). Reduce kh or the backfill slope.");
    lateral.push({ id: c.id, label: c.label, kind: c.kind, force: r.force, arm: r.arm });
    if (c.verticalRatio > 0 && r.force > 0)
      verticalThrust.push({ id: `${c.id}V`, label: `${c.label} (vertical component)`, kind: c.kind, weight: r.force * c.verticalRatio, x: B, y: r.arm, concrete: false });
  }
  if (seismicOn && i.seismic.inertia && !basement)
    for (const w of weights.filter((w) => w.concrete))
      lateral.push({ id: `inertia-${w.id}`, label: `Inertia, ${w.label.toLowerCase()}`, kind: "E", force: i.seismic.kh * w.weight, arm: w.y });
  const hb = i.water.enabled ? i.water.back : 0,
    hf = i.water.enabled ? i.water.front : 0,
    gw = i.water.gammaW;
  const upliftForce = basement ? 0 : (gw * (hb + hf) * B) / 2;
  const upliftX = hb + hf > 0 ? (B * (hf + 2 * hb)) / (3 * (hf + hb)) : B / 2;
  const frontWater = basement ? 0 : (gw * hf * hf) / 2;
  const keyDepth = i.key.enabled ? i.key.depth : 0;
  const passiveDepth = Math.min(i.toeSoil.cover, H) + tf + keyDepth;
  const passive = !basement && i.toeSoil.passive
    ? { force: i.toeSoil.mobilization * 0.5 * coeff.kp * i.toeSoil.gamma * passiveDepth ** 2, arm: passiveDepth / 3 - keyDepth, depth: passiveDepth }
    : { force: 0, arm: 0, depth: passiveDepth };
  if (i.key.enabled && !i.toeSoil.passive)
    warnings.push("The shear key relies on passive resistance in front of it; passive is switched off, so the key adds no sliding resistance.");

  // ---- Stem analysis per pressure component -------------------------------
  const stemWater = i.water.enabled ? i.water.back - tf : 0;
  const stemComps: PressureComponent[] = pressureComponents(i, coeff, { height: H, water: stemWater });
  if (seismicOn && i.seismic.inertia && i.seismic.method === "mononobe-okabe")
    stemComps.push({ id: "inertia", label: "Stem inertia", kind: "E", p: (z) => i.seismic.kh * i.concreteWeight * stemThickness(i, H - z), breaks: [], verticalRatio: 0 });
  const Ec = 4700 * Math.sqrt(i.fc) * 1000;
  const ei = (y: number) => (Ec * stemThickness(i, y) ** 3) / 12;
  const supports: StemSupports =
    i.wallType === "cantilever"
      ? { base: "fixed", top: "none", prop: null }
      : i.wallType === "propped"
        ? { base: "fixed", top: "none", prop: { y: i.prop.height, stiffness: i.prop.rigid ? null : i.prop.stiffness } }
        : { base: i.basement.base, top: i.basement.top, prop: null };
  const stemSol: { c: PressureComponent; s: StemSolution }[] = stemComps.map((c) => ({
    c,
    s: solveStem(H, ei, supports, { p: (y) => c.p(H - y), breaks: c.breaks.map((z) => H - z) }),
  }));
  const combine = (combo: RetainingWallCombination, f: (s: StemSolution) => number) =>
    stemSol.reduce((sum, { c, s }) => sum + kindFactor(combo, c.kind) * f(s), 0);
  const strength = i.strength.filter((c) => c.included);
  const service = i.service.filter((c) => c.included);
  const nullable = (combo: RetainingWallCombination, f: (s: StemSolution) => number | null) =>
    stemSol.length && f(stemSol[0]!.s) !== null ? combine(combo, (s) => f(s) ?? 0) : null;

  // ---- Stability (service) --------------------------------------------------
  const evaluate = (combo: RetainingWallCombination, liveVertical: boolean) => {
    let V = 0, MR = 0, MO = 0, PH = 0;
    for (const w of weights) {
      if (w.kind === "L" && !liveVertical) continue;
      const f = kindFactor(combo, w.kind);
      V += f * w.weight;
      MR += f * w.weight * w.x;
    }
    for (const w of verticalThrust) {
      const f = kindFactor(combo, w.kind);
      V += f * w.weight;
      MR += f * w.weight * w.x;
    }
    for (const l of lateral) {
      const f = kindFactor(combo, l.kind);
      PH += f * l.force;
      MO += f * l.force * l.arm;
    }
    const U = combo.h * upliftForce;
    MO += U * upliftX;
    const prop = i.wallType === "propped" ? (nullable(combo, (s) => s.prop) ?? 0) : 0;
    MR += prop * (tf + i.prop.height);
    return { V, MR, MO, PH, U, prop };
  };
  let stability: StabilityCase[] | null = null;
  if (!basement) {
    stability = service.map((combo) => {
      const a = evaluate(combo, false),
        b = evaluate(combo, true);
      const seismic = combo.e > 0 && seismicOn;
      const net = a.V - a.U;
      const bearingA = bearingPressure(B, a.V - a.U, a.MR - a.MO),
        bearingB = bearingPressure(B, b.V - b.U, b.MR - b.MO);
      const bearing = bearingB.qMax > bearingA.qMax ? bearingB : bearingA;
      const resistance = i.base.mu * Math.max(0, net) + passive.force + combo.h * frontWater + a.prop;
      return {
        id: combo.id,
        seismic,
        vertical: a.V,
        uplift: a.U,
        resisting: a.MR,
        overturning: a.MO,
        driving: a.PH,
        slidingResistance: resistance,
        fsOverturning: a.MO > 0 ? a.MR / a.MO : Infinity,
        fsSliding: a.PH > 0 ? resistance / a.PH : Infinity,
        fsOverturningRequired: seismic ? i.stability.seismic : i.stability.overturning,
        fsSlidingRequired: seismic ? i.stability.seismic : i.stability.sliding,
        bearing,
        allowable: i.base.allowable * (seismic ? i.base.seismicIncrease : 1),
      };
    });
  }

  // ---- Footing (strength) ---------------------------------------------------
  const flexure: FlexureCheck[] = [];
  const shear: ShearCheck[] = [];
  let footing: RetainingWallResult["footing"] = null;
  const fcfy = { fc: i.fc, fy: i.fy, es: i.es };
  const dToe = tf * 1000 - i.cover.footingBottom - i.bars.toeBottom.diameter / 2;
  const dHeel = tf * 1000 - i.cover.footingTop - i.bars.heelTop.diameter / 2;
  const asToe = barAreaPerMetre(i.bars.toeBottom),
    asHeel = barAreaPerMetre(i.bars.heelTop);
  const capBottom = slabFlexuralStrength(fcfy, [{ as: asToe, d: dToe }]);
  const capTop = slabFlexuralStrength(fcfy, [{ as: asHeel, d: dHeel }]);
  if (!basement) {
    const toe: MemberAction[] = [],
      heel: MemberAction[] = [],
      bearings: { combo: string; bearing: BearingResult }[] = [];
    const xf = g.frontBase,
      xb = g.backBase,
      slope = Math.tan((i.soil.beta * Math.PI) / 180);
    const soilColumn = (x: number) => {
      const top = g.stemTopLevel + (x - g.backTop) * slope,
        wl = hb;
      if (wl <= tf) return i.soil.gamma * (top - tf);
      const wet = Math.min(top, wl) - tf;
      return i.soil.gammaSat * wet + i.soil.gamma * Math.max(0, top - Math.max(wl, tf));
    };
    for (const combo of strength) {
      for (const liveVertical of [false, true]) {
        if (liveVertical && i.surcharge.live === 0) continue;
        const a = evaluate(combo, liveVertical);
        const br = bearingPressure(B, a.V - a.U, a.MR - a.MO);
        const name = liveVertical ? `${combo.id} (+L over heel)` : combo.id;
        bearings.push({ combo: name, bearing: br });
        if (br.shape === "unstable") {
          warnings.push(`${name}: factored resultant outside the base; footing not designed for this combination.`);
          continue;
        }
        const u = (x: number) => combo.h * gw * (hf + ((hb - hf) * x) / B);
        const fd = combo.d;
        const toeDown = (x: number) =>
          fd * (i.concreteWeight * tf + (i.toeSoil.includeWeight && x <= xf ? i.toeSoil.gamma * Math.min(i.toeSoil.cover, H) : 0));
        const toeNet = (x: number) => br.at(x) + u(x) - toeDown(x);
        const brk = br.shape === "triangle" ? [br.e > 0 ? br.contact : B - br.contact] : [];
        if (xf > 0) {
          const m = integrate((x) => toeNet(x) * (xf - x), 0, xf, brk, 16);
          const dv = Math.max(0, xf - dToe / 1000);
          const v = integrate(toeNet, 0, dv, brk, 16);
          toe.push({ combo: name, moment: m, shear: v });
        }
        if (B - xb > 0) {
          const heelDown = (x: number) =>
            fd * (i.concreteWeight * tf + soilColumn(x) + i.surcharge.dead) + (liveVertical ? combo.l * i.surcharge.live : 0);
          const net = (x: number) => heelDown(x) - br.at(x) - u(x);
          const pv = verticalThrust.reduce((s, w) => s + kindFactor(combo, w.kind) * w.weight, 0);
          const m = integrate((x) => net(x) * (x - xb), xb, B, brk, 16) + pv * (B - xb);
          const v = integrate(net, xb, B, brk, 16) + pv;
          heel.push({ combo: name, moment: m, shear: v });
        }
      }
    }
    footing = { toe, heel, bearing: bearings };
    const pick = (list: MemberAction[], sign: 1 | -1) =>
      list.reduce<MemberAction | null>((best, a) => (sign * a.moment > (best ? sign * best.moment : 0) ? a : best), null);
    const toeMax = pick(toe, 1), toeRev = pick(toe, -1), heelMax = pick(heel, 1), heelRev = pick(heel, -1);
    if (toeMax) flexure.push({ id: "toe-bottom", label: "Toe, bottom bars", mu: toeMax.moment, ...capBottom, combo: toeMax.combo, location: "front face of stem" });
    if (toeRev) flexure.push({ id: "toe-top", label: "Toe, top bars (reverse moment)", mu: -toeRev.moment, ...capTop, combo: toeRev.combo, location: "front face of stem" });
    if (heelMax) flexure.push({ id: "heel-top", label: "Heel, top bars", mu: heelMax.moment, ...capTop, combo: heelMax.combo, location: "back face of stem" });
    if (heelRev) flexure.push({ id: "heel-bottom", label: "Heel, bottom bars (reverse moment)", mu: -heelRev.moment, ...capBottom, combo: heelRev.combo, location: "back face of stem" });
    const vToe = toe.reduce<MemberAction | null>((b, a) => (Math.abs(a.shear) > Math.abs(b?.shear ?? 0) ? a : b), null);
    const vHeel = heel.reduce<MemberAction | null>((b, a) => (Math.abs(a.shear) > Math.abs(b?.shear ?? 0) ? a : b), null);
    if (vToe) {
      const c = shearCapacity(i.fc, asToe, dToe, false);
      shear.push({ id: "toe-shear", label: "Toe one-way shear", vu: Math.abs(vToe.shear), phiVc: c.phiVc, d: dToe, lambdaS: c.lambdaS, combo: vToe.combo, location: "d from the stem face" });
    }
    if (vHeel) {
      const c = shearCapacity(i.fc, asHeel, dHeel, false);
      shear.push({ id: "heel-shear", label: "Heel one-way shear", vu: Math.abs(vHeel.shear), phiVc: c.phiVc, d: dHeel, lambdaS: c.lambdaS, combo: vHeel.combo, location: "back face of stem" });
    }
  }

  // ---- Stem design (strength envelopes) -------------------------------------
  const back = i.bars.stemBack,
    front = i.bars.stemFront;
  const cut = i.bars.stemCut.enabled ? Math.min(i.bars.stemCut.height, H) : Infinity;
  const backAt = (y: number): RetainingWallBar => (y > cut + 1e-9 ? { ...back, spacing: back.spacing * 2 } : back);
  const dBack = (y: number) => stemThickness(i, y) * 1000 - i.cover.stemBack - back.diameter / 2;
  const dFront = (y: number) => stemThickness(i, y) * 1000 - i.cover.stemFront - front.diameter / 2;
  const yset = new Set<number>();
  for (let k = 0; k <= 40; k++) yset.add((H * k) / 40);
  if (Number.isFinite(cut)) {
    yset.add(cut);
    yset.add(Math.min(H, cut + 1e-6));
  }
  if (i.wallType === "propped") yset.add(i.prop.height);
  const ys = [...yset].sort((a, b) => a - b);
  const firstService = service[0];
  const stations: StemStation[] = ys.map((y) => {
    let mBack = 0, mFront = 0, v = 0;
    for (const combo of strength) {
      const m = combine(combo, (s) => s.moment(y)),
        sh = combine(combo, (s) => s.shear(y));
      mBack = Math.max(mBack, m);
      mFront = Math.min(mFront, m);
      v = Math.max(v, Math.abs(sh));
    }
    const ab = barAreaPerMetre(backAt(y)),
      af = barAreaPerMetre(front);
    return {
      y,
      t: stemThickness(i, y),
      mBack,
      mFront,
      v,
      phiMnBack: slabFlexuralStrength(fcfy, [{ as: ab, d: dBack(y) }]).phiMn,
      phiMnFront: slabFlexuralStrength(fcfy, [{ as: af, d: dFront(y) }]).phiMn,
      mService: firstService ? combine(firstService, (s) => s.moment(y)) : 0,
    };
  });
  const stemCombo = (y: number, sign: 1 | -1) => {
    let best = strength[0]?.id ?? "", val = 0;
    for (const combo of strength) {
      const m = sign * combine(combo, (s) => s.moment(y));
      if (m > val) {
        val = m;
        best = combo.id;
      }
    }
    return best;
  };
  const worst = (f: (s: StemStation) => number) =>
    stations.reduce((b, s) => (f(s) > f(b) ? s : b), stations[0]!);
  const sBack = worst((s) => (s.phiMnBack > 0 ? s.mBack / s.phiMnBack : s.mBack > 0 ? Infinity : 0));
  {
    const cap = slabFlexuralStrength(fcfy, [{ as: barAreaPerMetre(backAt(sBack.y)), d: dBack(sBack.y) }]);
    flexure.unshift({ id: "stem-back", label: "Stem, back-face verticals", mu: sBack.mBack, ...cap, combo: stemCombo(sBack.y, 1), location: `y = ${sBack.y.toFixed(2)} m above footing` });
  }
  const sFront = worst((s) => (s.phiMnFront > 0 ? -s.mFront / s.phiMnFront : -s.mFront > 0 ? Infinity : 0));
  if (sFront.mFront < -1e-9) {
    const cap = slabFlexuralStrength(fcfy, [{ as: barAreaPerMetre(front), d: dFront(sFront.y) }]);
    flexure.splice(1, 0, { id: "stem-front", label: "Stem, front-face verticals", mu: -sFront.mFront, ...cap, combo: stemCombo(sFront.y, -1), location: `y = ${sFront.y.toFixed(2)} m above footing` });
  }
  const sShear = worst((s) => {
    const c = shearCapacity(i.fc, barAreaPerMetre(backAt(s.y)), dBack(s.y), true);
    return s.v / c.phiVc;
  });
  {
    const c = shearCapacity(i.fc, barAreaPerMetre(backAt(sShear.y)), dBack(sShear.y), true);
    let combo = "";
    let vmax = -1;
    for (const k of strength) {
      const v = Math.abs(combine(k, (s) => s.shear(sShear.y)));
      if (v > vmax) {
        vmax = v;
        combo = k.id;
      }
    }
    shear.unshift({ id: "stem-shear", label: "Stem one-way shear", vu: sShear.v, phiVc: c.phiVc, d: dBack(sShear.y), lambdaS: c.lambdaS, combo, location: `y = ${sShear.y.toFixed(2)} m above footing` });
  }
  const reactions = strength.map((combo) => ({
    combo: combo.id,
    prop: nullable(combo, (s) => s.prop),
    top: nullable(combo, (s) => s.topForce),
    topMoment: nullable(combo, (s) => s.topMoment),
    baseShear: combine(combo, (s) => s.baseShear),
    baseMoment: combine(combo, (s) => s.baseMoment),
  }));
  const serviceReactions = firstService
    ? { combo: firstService.id, prop: nullable(firstService, (s) => s.prop), top: nullable(firstService, (s) => s.topForce) }
    : { combo: "", prop: null, top: null };

  // ---- Development and curtailment -------------------------------------------
  const db = back.diameter,
    root = slabSqrtFc(i.fc),
    psiC = i.fc < 40 ? i.fc / 105 + 0.6 : 1,
    psiR = back.spacing >= 6 * db ? 1 : 1.6;
  const ldh = Math.max(((i.fy * psiR * psiC) / (23 * root)) * db ** 1.5, 8 * db, 150);
  const available = basement
    ? tf * 1000 - i.cover.footingBottom
    : tf * 1000 - i.cover.footingBottom - i.bars.toeBottom.diameter - i.bars.footingDistribution.diameter;
  const cb = Math.min(i.cover.stemBack + db / 2, back.spacing / 2),
    psiS = db <= 19.1 ? 0.8 : 1,
    psiG = i.fy <= 420 ? 1 : i.fy <= 550 ? 1.15 : 1.3;
  const ld = Math.max(300, ((i.fy * psiS * psiG) / (1.1 * root * Math.min(2.5, cb / db))) * db);
  const development = { ldh, available, ld, lap: Math.max(300, 1.3 * ld) };

  // ---- Checks -----------------------------------------------------------------
  const checks: RwCheck[] = [];
  const push = (c: Omit<RwCheck, "dcr"> & { dcr?: number | null }) =>
    checks.push({ ...c, dcr: c.dcr === undefined ? (c.capacity > 0 ? c.demand / c.capacity : Infinity) : c.dcr });
  if (stability)
    for (const s of stability) {
      push({ id: `ot:${s.id}`, group: "Stability", label: `${s.id} · Overturning FS`, demand: s.fsOverturningRequired, capacity: s.fsOverturning, unit: "FS", detail: `FS = ΣMR/ΣMO = ${s.resisting.toFixed(1)}/${s.overturning.toFixed(1)} = ${s.fsOverturning.toFixed(2)} (required ${s.fsOverturningRequired.toFixed(2)})`, clause: clauses.overturning() });
      push({ id: `sl:${s.id}`, group: "Stability", label: `${s.id} · Sliding FS`, demand: s.fsSlidingRequired, capacity: s.fsSliding, unit: "FS", detail: `FS = ${s.slidingResistance.toFixed(1)}/${s.driving.toFixed(1)} = ${s.fsSliding.toFixed(2)} (required ${s.fsSlidingRequired.toFixed(2)}); μ(V − U)${passive.force > 0 ? " + passive" : ""}${i.wallType === "propped" ? " + prop" : ""}`, clause: clauses.sliding() });
      push({ id: `bp:${s.id}`, group: "Stability", label: `${s.id} · Bearing pressure`, demand: s.bearing.qMax, capacity: s.allowable, unit: "kPa", detail: s.bearing.shape === "unstable" ? "Resultant outside the base" : `${s.bearing.shape === "triangle" ? `Triangular contact ${s.bearing.contact.toFixed(2)} m (e > B/6)` : "Full contact (e ≤ B/6)"}; q max ${s.bearing.qMax.toFixed(1)} kPa`, clause: clauses.bearing() });
      push({ id: `ec:${s.id}`, group: "Stability", label: `${s.id} · Eccentricity`, demand: Math.abs(s.bearing.e), capacity: B / 3, unit: "m", dcr: s.bearing.shape === "unstable" ? Infinity : undefined, detail: `e = ${Number.isFinite(s.bearing.e) ? s.bearing.e.toFixed(3) : "—"} m; B/6 = ${(B / 6).toFixed(3)} m`, clause: clauses.eccentricity() });
    }
  for (const f of flexure)
    push({ id: `fl:${f.id}`, group: f.id.startsWith("stem") ? "Stem" : "Footing", label: `${f.label} · Flexure`, demand: f.mu, capacity: f.phiMn, unit: "kN·m/m", detail: `${f.combo}; ${f.location}; As ${f.as.toFixed(0)} mm²/m, d ${f.d.toFixed(0)} mm, φ ${f.phi.toFixed(3)}${f.tensionControlled ? "" : " (not tension-controlled)"}`, clause: f.id.startsWith("stem") ? clauses.stemFlexure() : clauses.footingFlexure() });
  for (const v of shear)
    push({ id: `sh:${v.id}`, group: v.id.startsWith("stem") ? "Stem" : "Footing", label: v.label, demand: v.vu, capacity: v.phiVc, unit: "kN/m", detail: `${v.combo}; ${v.location}; d ${v.d.toFixed(0)} mm, λs ${v.lambdaS.toFixed(3)}`, clause: v.id.startsWith("stem") ? clauses.stemShear() : clauses.footingShear() });
  // Minimum steel and spacing.
  const tBase = i.stemBase * 1000,
    rhoMin = slabMinimumSteelRatio(i.fy);
  const asBack = barAreaPerMetre(back),
    asFront = barAreaPerMetre(front),
    asHor = barAreaPerMetre(i.bars.stemHorizontal);
  push({ id: "min:stem-back", group: "Detailing", label: "Stem back face · minimum steel", demand: rhoMin * tBase * 1000, capacity: asBack, unit: "mm²/m", detail: `ρmin ${rhoMin.toFixed(4)} × ${tBase.toFixed(0)} mm`, clause: clauses.minFlexural() });
  if (i.wallType !== "cantilever") {
    const rhoL = i.fy >= 420 && Math.max(back.diameter, front.diameter) <= 16 ? 0.0012 : 0.0015;
    push({ id: "min:stem-vertical", group: "Detailing", label: "Stem vertical, both faces · wall minimum", demand: rhoL * tBase * 1000, capacity: asBack + asFront, unit: "mm²/m", detail: `ρℓ ${rhoL} × ${tBase.toFixed(0)} mm`, clause: clauses.wallVertical() });
  }
  const rhoT = i.fy >= 420 && i.bars.stemHorizontal.diameter <= 16 ? 0.002 : 0.0025;
  push({ id: "min:stem-horizontal", group: "Detailing", label: "Stem horizontal, both faces · minimum", demand: rhoT * tBase * 1000, capacity: 2 * asHor, unit: "mm²/m", detail: `ρt ${rhoT} × ${tBase.toFixed(0)} mm (fy ${i.fy} MPa, Ø${i.bars.stemHorizontal.diameter})`, clause: clauses.wallHorizontal() });
  const sMaxStem = Math.min(3 * i.stemTop * 1000, 450);
  push({ id: "sp:stem-back", group: "Detailing", label: "Stem back verticals · maximum spacing", demand: backAt(H).spacing, capacity: sMaxStem, unit: "mm", detail: `≤ min(3t, 450) with t = ${(i.stemTop * 1000).toFixed(0)} mm`, clause: clauses.spacingVertical() });
  push({ id: "sp:stem-front", group: "Detailing", label: "Stem front verticals · maximum spacing", demand: front.spacing, capacity: sMaxStem, unit: "mm", detail: "≤ min(3t, 450)", clause: clauses.spacingVertical() });
  push({ id: "sp:stem-horizontal", group: "Detailing", label: "Stem horizontals · maximum spacing", demand: i.bars.stemHorizontal.spacing, capacity: sMaxStem, unit: "mm", detail: "≤ min(3t, 450)", clause: clauses.spacingHorizontal() });
  push({ id: "cr:stem-back", group: "Detailing", label: "Stem back face · crack-control spacing", demand: backAt(sBack.y).spacing, capacity: crackSpacing(i.fy, i.cover.stemBack), unit: "mm", detail: `fs = 2/3 fy = ${((2 / 3) * i.fy).toFixed(0)} MPa, cc = ${i.cover.stemBack} mm`, clause: clauses.crackControl() });
  if (sFront.mFront < -1e-9)
    push({ id: "cr:stem-front", group: "Detailing", label: "Stem front face · crack-control spacing", demand: front.spacing, capacity: crackSpacing(i.fy, i.cover.stemFront), unit: "mm", detail: `cc = ${i.cover.stemFront} mm`, clause: clauses.crackControl() });
  if (!basement) {
    const tF = tf * 1000,
      sMaxF = Math.min(3 * tF, 450);
    push({ id: "min:toe", group: "Detailing", label: "Footing bottom bars · minimum steel", demand: rhoMin * tF * 1000, capacity: asToe, unit: "mm²/m", detail: `ρmin ${rhoMin.toFixed(4)} × ${tF.toFixed(0)} mm`, clause: clauses.minFlexural() });
    push({ id: "min:heel", group: "Detailing", label: "Footing top bars · minimum steel", demand: rhoMin * tF * 1000, capacity: asHeel, unit: "mm²/m", detail: `ρmin ${rhoMin.toFixed(4)} × ${tF.toFixed(0)} mm`, clause: clauses.minFlexural() });
    push({ id: "min:footing-dist", group: "Detailing", label: "Footing distribution, both faces · shrinkage", demand: rhoMin * tF * 1000, capacity: 2 * barAreaPerMetre(i.bars.footingDistribution), unit: "mm²/m", detail: `ρ ${rhoMin.toFixed(4)} × ${tF.toFixed(0)} mm (24.4.3.2)`, clause: clauses.minFlexural() });
    for (const [id, label, bar] of [
      ["toe", "Footing bottom bars", i.bars.toeBottom],
      ["heel", "Footing top bars", i.bars.heelTop],
      ["dist", "Footing distribution bars", i.bars.footingDistribution],
    ] as const)
      push({ id: `sp:${id}`, group: "Detailing", label: `${label} · maximum spacing`, demand: bar.spacing, capacity: sMaxF, unit: "mm", detail: `≤ min(3h, 450), h = ${tF.toFixed(0)} mm`, clause: clauses.spacingFooting() });
    push({ id: "cr:toe", group: "Detailing", label: "Footing bottom bars · crack-control spacing", demand: i.bars.toeBottom.spacing, capacity: crackSpacing(i.fy, i.cover.footingBottom), unit: "mm", detail: `cc = ${i.cover.footingBottom} mm`, clause: clauses.crackControl() });
    push({ id: "cr:heel", group: "Detailing", label: "Footing top bars · crack-control spacing", demand: i.bars.heelTop.spacing, capacity: crackSpacing(i.fy, i.cover.footingTop), unit: "mm", detail: `cc = ${i.cover.footingTop} mm`, clause: clauses.crackControl() });
  }
  push({ id: "dev:hook", group: "Detailing", label: "Stem dowels · hooked development into footing", demand: ldh, capacity: available, unit: "mm", detail: `ldh = max(fy ψr ψc db^1.5/(23√f′c), 8db, 150) with ψr ${psiR}, ψc ${psiC.toFixed(2)}; lap above base (Class B) ${development.lap.toFixed(0)} mm`, clause: clauses.hook() });
  if (Number.isFinite(cut) && cut < H) {
    const half = { ...back, spacing: back.spacing * 2 };
    let yt = 0;
    for (let k = 0; k <= 400; k++) {
      const y = (H * k) / 400;
      const st = slabFlexuralStrength(fcfy, [{ as: barAreaPerMetre(half), d: dBack(y) }]).phiMn;
      let m = 0;
      for (const combo of strength) m = Math.max(m, combine(combo, (s) => s.moment(y)));
      if (m > st) yt = y;
    }
    const ext = Math.max(dBack(yt) / 1000, (12 * db) / 1000);
    push({ id: "cut:stem-back", group: "Detailing", label: "Stem back bars · cut-off height", demand: yt + ext, capacity: cut, unit: "m", detail: `Half the bars needed to ${yt.toFixed(2)} m; + max(d, 12db) = ${ext.toFixed(2)} m`, clause: clauses.cutoff() });
  }

  // ---- Warnings -----------------------------------------------------------------
  if (i.soil.theory === "at-rest" && i.soil.beta > 0)
    warnings.push("At-rest pressure with a sloping backfill uses K0 without a slope correction; review with the geotechnical engineer.");
  if (i.soil.theory === "coulomb" && i.heel > 0 && !basement)
    warnings.push("Coulomb pressure is applied on the vertical plane through the heel with the entered δ; δ there is soil-on-soil friction.");
  if (i.seismic.method === "wood" && i.wallType === "cantilever")
    warnings.push("Wood's method is intended for non-yielding walls; a cantilever wall normally uses Mononobe-Okabe.");
  if (i.seismic.method === "mononobe-okabe" && i.wallType === "basement")
    warnings.push("Mononobe-Okabe assumes a yielding wall; a basement wall restrained by slabs normally uses Wood's method.");
  if (i.wallType === "basement")
    warnings.push("Basement wall: stability and footing are not checked here. Design the slabs and foundation for the reported reactions, and check the temporary cantilever stage before the top slab is cast.");
  if (i.wallType === "propped")
    warnings.push("The prop, its connections and the supporting structure must be designed for the reported reactions; the stage before the prop is installed is not checked.");
  if (!basement)
    warnings.push("Global (overall slope) stability and settlement are not evaluated; obtain them from the geotechnical engineer.");
  warnings.push("The stem is fixed at the footing; footing rotation is not modelled.");
  for (const f of flexure)
    if (!f.tensionControlled && f.mu > 0)
      warnings.push(`${f.label}: section is not tension-controlled (φ < 0.90).`);

  return {
    engine: RETAINING_WALL_ENGINE,
    geometry: g,
    coefficients: coeff,
    weights,
    lateral,
    verticalThrust,
    uplift: { force: upliftForce, x: upliftX },
    passive,
    stability,
    stem: {
      components: stemComps.map((c) => {
        const r = componentResultant(c, H);
        return { id: c.id, label: c.label, kind: c.kind, base: c.p(H), force: r.force, arm: r.arm };
      }),
      stations,
      pressure: (id, y) => stemComps.find((c) => c.id === id)?.p(H - y) ?? 0,
      reactions,
      serviceReactions,
    },
    footing,
    flexure,
    shear,
    development,
    checks,
    warnings,
  };
}

/** Overall status at the DCR limit (screening only, not code compliance). */
export function retainingWallStatus(r: RetainingWallResult, dcrLimit = 1) {
  const worst = r.checks.reduce((m, c) => Math.max(m, c.dcr ?? 0), 0);
  return { worst, pass: worst <= dcrLimit + 1e-9 };
}
