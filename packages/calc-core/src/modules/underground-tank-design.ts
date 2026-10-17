/**
 * Underground rectangular tank design (engine tank-0.1.0), ACI 350-20.
 *
 * Panels are Kirchhoff plates (the retaining-wall BFS plate solver, D = 1):
 *  - Walls: centreline span × (H + tb/2 [+ tr/2]); vertical edges fixed
 *    (monolithic corners), base fixed or pinned, top pinned under a roof or
 *    free. Load positive inwards: earth, groundwater, surcharge (empty tank)
 *    and liquid (leak test, negative). Front face = inside face.
 *  - Base slab: Lc × Wc on the walls, net upward pressure (uplift when empty;
 *    soil reaction to walls and roof when full).
 *  - Roof: Lc × Wc on the walls, self weight, soil cover, live load.
 * Design moments by Wood–Armer per face and direction; walls in the leak test
 * also carry the direct tension delivered by the edge shear of the adjacent
 * walls (combined flexure + tension by strain compatibility).
 *
 * ACI 350-20 (clause numbers † to confirm against the licensed text):
 *  - Sd = φfy / (γ fs,max) ≥ 1.0 on flexure and direct tension, γ = factored
 *    / service; fs,max for flexure 320/(β√(s² + 4(2 + db/2)²)) ksi (normal)
 *    or 260/(…) (severe), in inches, ≤ 36 / 30 ksi; direct tension 20 / 17
 *    ksi; β = 1.2 (h ≥ 16 in) or 1.35.
 *  - Shrinkage and temperature steel by joint spacing (Table 24.4.3.2†),
 *    walls ≥ 300 mm when H ≥ 3 m, cover ≥ 50 mm, spacing ≤ 300 mm.
 *  - Shear Vc = 0.17(1 + Nu/(3.5Ag))λ√f′c b d (tension), φ = 0.75.
 *  - Flotation FS ≥ input (empty tank, no live load), bearing (full tank).
 */
import type { DesignCheck } from "../design-review";
import { tankClauses as clauses } from "../code-clauses";
import { slabSqrtFc } from "./slab-design";
import { atRestK0, rankineKa } from "./retaining-wall-pressure";
import { solveWallPlate, woodArmer, type PlateEdge, type PlateField } from "./retaining-wall-plate-fe";
import { TANK_ENGINE, tankBarArea, type TankBar, type TankInput } from "./underground-tank";

const KSI = 6.894757;

/** ACI 350 maximum allowable service steel stress, MPa. */
export function tankFsMax(exposure: "normal" | "severe", kind: "flexure" | "tension", h: number, bar: TankBar) {
  if (kind === "tension") return (exposure === "normal" ? 20 : 17) * KSI;
  const beta = h >= 406 ? 1.2 : 1.35,
    s = bar.spacing / 25.4,
    db = bar.diameter / 25.4;
  const fs = (exposure === "normal" ? 320 : 260) / (beta * Math.sqrt(s * s + 4 * (2 + db / 2) ** 2));
  return Math.min(fs, exposure === "normal" ? 36 : 30) * KSI;
}

/** Environmental durability factor Sd = φ fy / (γ fs) ≥ 1. */
export const tankSd = (fy: number, gamma: number, fs: number, phi = 0.9) => Math.max(1, (phi * fy) / (Math.max(gamma, 1e-9) * fs));

/** ACI 350 shrinkage and temperature ratio by joint spacing (Grade 60 / Grade 40), total of both faces. */
export function tankShrinkageRatio(fy: number, jointSpacing: number) {
  const ft = jointSpacing / 0.3048;
  const g60 = fy >= 413;
  if (ft < 20) return 0.003;
  if (ft < 30) return g60 ? 0.004 : 0.005;
  if (ft < 40) return g60 ? 0.005 : 0.006;
  return g60 ? 0.005 : 0.006;
}

/**
 * Rectangular section 1000 mm wide, two steel layers, axial force N (kN/m,
 * tension positive), moment about mid-depth. Returns φMn, kN·m/m.
 */
export function sectionStrength(fc: number, fy: number, es: number, h: number, tension: { as: number; d: number }, compression: { as: number; d: number }, nTension = 0) {
  const beta = Math.max(0.65, 0.85 - (0.05 * Math.max(0, fc - 28)) / 7);
  const fs = (d: number, c: number) => Math.max(-fy, Math.min(fy, (es * 0.003 * (d - c)) / c));
  const N = nTension * 1000; // N per m
  const res = (c: number) => {
    const a = Math.min(beta * c, h),
      C = 0.85 * fc * 1000 * a;
    const Ts = tension.as * fs(tension.d, c),
      Tc = compression.as * fs(compression.d, c);
    return { a, C, Ts, Tc, f: Ts + Tc - C - N };
  };
  let lo = 1e-3,
    hi = h * 1.5;
  if (res(lo).f < 0) return { phiMn: 0, phi: 0.9, c: 0, strain: Infinity }; // pure tension beyond steel
  for (let k = 0; k < 80; k++) {
    const c = (lo + hi) / 2;
    if (res(c).f > 0) lo = c;
    else hi = c;
  }
  const c = (lo + hi) / 2,
    r = res(c);
  const mn = (r.C * (h / 2 - r.a / 2) + r.Ts * (tension.d - h / 2) + r.Tc * (compression.d - h / 2)) / 1e6;
  const strain = (0.003 * (tension.d - c)) / c,
    ey = fy / es,
    phi = 0.65 + 0.25 * Math.max(0, Math.min(1, (strain - ey) / 0.003));
  return { phiMn: phi * mn, phi, c, strain };
}

export type TankPanelId = "long" | "short" | "base" | "roof";
export type TankFace = "frontY" | "backY" | "frontX" | "backX";
export interface TankPeak {
  panel: TankPanelId;
  face: TankFace;
  case: string;
  x: number;
  y: number;
  mu: number;
  ms: number;
  nu: number;
  gamma: number;
  sd: number;
  fsMax: number;
  phiMn: number;
  dcr: number;
}
export interface TankCheck extends DesignCheck {
  group: "Stability" | "Walls" | "Base Slab" | "Roof Slab" | "Detailing";
  demand: number;
  capacity: number;
  unit: string;
}
export interface TankPanelResult {
  id: TankPanelId;
  label: string;
  length: number;
  height: number;
  edges: { base: PlateEdge; top: PlateEdge; left: PlateEdge; right: PlateEdge };
  /** Factored envelope of a face demand at (x, y), kN·m/m. */
  field: (face: TankFace, x: number, y: number) => number;
  peaks: TankPeak[];
}
export interface TankResult {
  engine: typeof TANK_ENGINE;
  geometry: { lc: number; wc: number; outerX: number; outerY: number; baseX: number; baseY: number; hw: number; k: number };
  panels: TankPanelResult[];
  flotation: { uplift: number; resisting: number; fs: number; required: number; items: { label: string; weight: number }[] };
  bearing: { q: number; allowable: number };
  checks: TankCheck[];
  warnings: string[];
}

type LoadCase = { id: string; label: string; q: ((x: number, y: number) => number)[]; factors: number[]; service: number[] };

export function designTank(i: TankInput): TankResult {
  const warnings: string[] = [];
  const tw = i.wall,
    tb = i.base,
    tr = i.roof.enabled ? i.roof.thickness : 0;
  const lc = i.lx + tw,
    wc = i.ly + tw,
    outerX = i.lx + 2 * tw,
    outerY = i.ly + 2 * tw,
    baseX = outerX + 2 * i.projection,
    baseY = outerY + 2 * i.projection;
  const H = i.height,
    hPlate = H + tb / 2 + tr / 2;
  const s = i.soil,
    gw = s.gammaW,
    k = s.theory === "at-rest" ? atRestK0(s.phi, s.ocr) : rankineKa(s.phi, 0);
  // Heights above the base slab top (y_clear). Groundwater input is above the slab underside.
  const hwClear = Math.max(0, s.water - tb),
    ground = s.ground;
  const yc = (y: number) => y - tb / 2; // plate y → clear height above the base slab top
  const sigmaV = (yClear: number) => {
    const z = ground - yClear;
    if (z <= 0) return 0;
    const zw = ground - hwClear; // depth to water
    return s.gamma * Math.min(z, Math.max(0, zw)) + (s.gammaSat - gw) * Math.max(0, z - Math.max(0, zw));
  };
  const earth = (_x: number, y: number) => k * sigmaV(Math.max(0, yc(y)));
  const water = (_x: number, y: number) => gw * Math.max(0, hwClear - Math.max(0, yc(y)));
  const surcharge = (_x: number, y: number) => (yc(y) <= ground ? k * s.surcharge : 0);
  const liquid = (_x: number, y: number) => -i.liquid.gamma * Math.max(0, i.liquid.depth - Math.max(0, yc(y)));
  const f = i.factors;
  const wallCases: LoadCase[] = [
    { id: "leak", label: `Leak test: ${f.liquid}F`, q: [liquid, earth, water, surcharge], factors: [f.liquid, 0, 0, 0], service: [1, 0, 0, 0] },
    { id: "empty", label: `Empty, backfilled: ${f.earth}H + ${f.live}L`, q: [liquid, earth, water, surcharge], factors: [0, f.earth, f.earth, f.live], service: [0, 1, 1, 1] },
  ];

  // ---- Section capacities --------------------------------------------------------
  const b = i.bars,
    c = i.cover;
  const hW = tw * 1000;
  const dV = (bar: TankBar) => hW - c - bar.diameter / 2;
  const dH = (bar: TankBar, outer: TankBar) => hW - c - outer.diameter - bar.diameter / 2;
  const wallSection = (face: TankFace) => {
    // front = inside face.
    if (face === "frontY") return { t: { as: tankBarArea(b.verticalInside), d: dV(b.verticalInside) }, cmp: { as: tankBarArea(b.verticalOutside), d: hW - dV(b.verticalOutside) }, bar: b.verticalInside, h: hW };
    if (face === "backY") return { t: { as: tankBarArea(b.verticalOutside), d: dV(b.verticalOutside) }, cmp: { as: tankBarArea(b.verticalInside), d: hW - dV(b.verticalInside) }, bar: b.verticalOutside, h: hW };
    if (face === "frontX") return { t: { as: tankBarArea(b.horizontalInside), d: dH(b.horizontalInside, b.verticalInside) }, cmp: { as: tankBarArea(b.horizontalOutside), d: hW - dH(b.horizontalOutside, b.verticalOutside) }, bar: b.horizontalInside, h: hW };
    return { t: { as: tankBarArea(b.horizontalOutside), d: dH(b.horizontalOutside, b.verticalOutside) }, cmp: { as: tankBarArea(b.horizontalInside), d: hW - dH(b.horizontalInside, b.verticalInside) }, bar: b.horizontalOutside, h: hW };
  };
  const slabSection = (h: number, tensionBar: TankBar, otherBar: TankBar, inner: boolean) => {
    const d = h - c - (inner ? tensionBar.diameter : 0) - tensionBar.diameter / 2;
    return { t: { as: tankBarArea(tensionBar), d }, cmp: { as: tankBarArea(otherBar), d: c + otherBar.diameter / 2 }, bar: tensionBar, h };
  };

  // ---- Wall plates -------------------------------------------------------------------
  const wallEdges = { base: i.wallBase as PlateEdge, top: (i.roof.enabled ? "pinned" : "free") as PlateEdge, left: "fixed" as PlateEdge, right: "fixed" as PlateEdge };
  const solvePanel = (L: number, Hh: number, edges: typeof wallEdges, loads: ((x: number, y: number) => number)[]) =>
    solveWallPlate(L, Hh, 0.2, { ...edges, vertical: [], horizontal: [] }, loads.map((q) => ({ q })), i.divisions);
  const wallSols = {
    long: solvePanel(lc, hPlate, wallEdges, wallCases[0]!.q),
    short: solvePanel(wc, hPlate, wallEdges, wallCases[0]!.q),
  };
  // Direct tension in a wall from the edge shear of the adjacent wall (leak test only).
  const edgeTension = (adjacent: ReturnType<typeof solvePanel>, y: number, lcse: LoadCase) =>
    lcse.id === "leak" ? Math.abs(lcse.factors.reduce((sum, fac, n) => sum + fac * adjacent.at(n, 0, y).qx, 0)) : 0;

  const combine = (fields: PlateField[], fac: number[]) => {
    let mx = 0,
      my = 0,
      mxy = 0,
      qx = 0,
      qy = 0;
    fields.forEach((v, n) => {
      mx += fac[n]! * v.mx;
      my += fac[n]! * v.my;
      mxy += fac[n]! * v.mxy;
      qx += fac[n]! * v.qx;
      qy += fac[n]! * v.qy;
    });
    return { mx, my, mxy, qx, qy };
  };
  const faces: TankFace[] = ["frontY", "backY", "frontX", "backX"];
  const nx = 24,
    ny = 16;
  const panelDesign = (
    id: TankPanelId,
    label: string,
    L: number,
    Hh: number,
    sol: ReturnType<typeof solvePanel>,
    cases: LoadCase[],
    section: (face: TankFace) => { t: { as: number; d: number }; cmp: { as: number; d: number }; bar: TankBar; h: number },
    tension: ((y: number, c: LoadCase) => number) | null,
    edges: typeof wallEdges,
  ): TankPanelResult => {
    const peaks: TankPeak[] = [];
    for (const face of faces) {
      let best: TankPeak | null = null;
      for (let a = 0; a <= nx; a++)
        for (let bb = 0; bb <= ny; bb++) {
          const x = (L * a) / nx,
            y = (Hh * bb) / ny;
          const fields = cases[0]!.q.map((_, n) => sol.at(n, x, y));
          for (const lc of cases) {
            const fu = combine(fields, lc.factors),
              fsv = combine(fields, lc.service);
            const mu = woodArmer(fu.mx, fu.my, fu.mxy)[face],
              ms = woodArmer(fsv.mx, fsv.my, fsv.mxy)[face];
            if (mu <= 1e-9) continue;
            const sec = section(face);
            const nu = tension && (face === "frontX" || face === "backX") ? tension(y, lc) : 0;
            const gamma = ms > 1e-9 ? mu / ms : 1.6;
            const fsMax = Math.min(tankFsMax(i.exposure, "flexure", sec.h, sec.bar), nu > 0 ? tankFsMax(i.exposure, "tension", sec.h, sec.bar) : Infinity);
            const sd = tankSd(i.fy, gamma, fsMax);
            const cap = sectionStrength(i.fc, i.fy, i.es, sec.h, sec.t, sec.cmp, sd * nu).phiMn;
            const dcr = cap > 0 ? (sd * mu) / cap : Infinity;
            if (!best || dcr > best.dcr) best = { panel: id, face, case: lc.label, x, y, mu, ms, nu, gamma, sd, fsMax, phiMn: cap, dcr };
          }
        }
      if (best) peaks.push(best);
    }
    return {
      id,
      label,
      length: L,
      height: Hh,
      edges,
      peaks,
      field: (face, x, y) => {
        const fields = cases[0]!.q.map((_, n) => sol.at(n, x, y));
        return cases.reduce((m, lc) => {
          const fu = combine(fields, lc.factors);
          return Math.max(m, woodArmer(fu.mx, fu.my, fu.mxy)[face]);
        }, 0);
      },
    };
  };
  const panels: TankPanelResult[] = [];
  panels.push(
    panelDesign("long", `Long wall (${lc.toFixed(2)} m span)`, lc, hPlate, wallSols.long, wallCases, wallSection, (y, lcse) => edgeTension(wallSols.short, y, lcse), wallEdges),
    panelDesign("short", `Short wall (${wc.toFixed(2)} m span)`, wc, hPlate, wallSols.short, wallCases, wallSection, (y, lcse) => edgeTension(wallSols.long, y, lcse), wallEdges),
  );

  // ---- Weights -------------------------------------------------------------------------
  const gc = i.concreteWeight;
  const wallVol = 2 * (outerX + i.ly) * tw * H,
    baseVol = baseX * baseY * tb,
    roofVol = i.roof.enabled ? outerX * outerY * tr : 0;
  const roofCover = i.roof.enabled ? i.roof.cover * s.gamma * outerX * outerY : 0;
  const projArea = baseX * baseY - outerX * outerY;
  // Soil over the projection from the slab top to ground (buoyant below the water table).
  const soilHeight = Math.max(0, ground);
  const soilAbove = Math.max(0, soilHeight - hwClear),
    soilBelow = Math.min(soilHeight, hwClear);
  const projSoil = projArea * (s.gamma * soilAbove + (s.gammaSat - gw) * soilBelow);
  const projWaterFree = projArea * gw * soilBelow; // water above the projection balances its own uplift
  const dead = gc * (wallVol + baseVol + roofVol);
  const upliftArea = baseX * baseY;
  const uplift = gw * s.water * upliftArea;
  const resisting = dead + roofCover + projSoil + projWaterFree;
  const flotation = {
    uplift,
    resisting,
    fs: uplift > 0 ? resisting / uplift : Infinity,
    required: i.flotationFS,
    items: [
      { label: "Walls", weight: gc * wallVol },
      { label: "Base slab", weight: gc * baseVol },
      { label: "Roof slab", weight: gc * roofVol },
      { label: "Soil cover on roof", weight: roofCover },
      { label: "Soil and water over the base projection", weight: projSoil + projWaterFree },
    ].filter((x) => x.weight > 0),
  };
  const liquidW = i.liquid.gamma * i.liquid.depth * i.lx * i.ly;
  const roofLive = i.roof.enabled ? i.roof.live * outerX * outerY : 0;
  const bearing = { q: (dead + roofCover + projSoil + projWaterFree + liquidW + roofLive) / upliftArea - gw * s.water, allowable: s.allowable };

  // ---- Base slab -------------------------------------------------------------------------
  const slabEdges = (e: "fixed" | "pinned") => ({ base: e as PlateEdge, top: e as PlateEdge, left: e as PlateEdge, right: e as PlateEdge });
  const baseEdges = slabEdges(i.baseEdge);
  const uplift1 = () => gw * s.water; // kPa upward (= positive "inward" towards the tank)
  const selfBase = () => -gc * tb;
  const wallsOnSoil = () => (gc * (wallVol + roofVol) + roofCover) / (lc * wc); // reaction pushing up
  const liveOnSoil = () => roofLive / (lc * wc);
  const baseSol = solvePanel(lc, wc, baseEdges, [uplift1, selfBase, wallsOnSoil, liveOnSoil]);
  const baseCases: LoadCase[] = [
    { id: "uplift", label: `Empty, uplift: ${f.earth}·γw·hw − ${f.deadMin}D`, q: [uplift1, selfBase, wallsOnSoil, liveOnSoil], factors: [f.earth, f.deadMin, 0, 0], service: [1, 1, 0, 0] },
    { id: "bearing", label: `Full, soil reaction: ${f.dead}D + ${f.live}L`, q: [uplift1, selfBase, wallsOnSoil, liveOnSoil], factors: [0, 0, f.dead, f.live], service: [0, 0, 1, 1] },
  ];
  const hB = tb * 1000;
  // Front face of the slab plate = top (load positive upwards: tension on the top face at mid-span).
  const baseSection = (face: TankFace) =>
    face === "frontY" || face === "frontX"
      ? slabSection(hB, b.baseTop, b.baseBottom, face === "frontY")
      : slabSection(hB, b.baseBottom, b.baseTop, face === "backY");
  panels.push(panelDesign("base", "Base slab", lc, wc, baseSol, baseCases, baseSection, null, baseEdges));

  // ---- Roof --------------------------------------------------------------------------------
  if (i.roof.enabled) {
    const roofEdges = slabEdges(i.roof.edge);
    const dRoof = () => gc * tr + s.gamma * i.roof.cover,
      lRoof = () => i.roof.live;
    const roofSol = solvePanel(lc, wc, roofEdges, [dRoof, lRoof]);
    const roofCases: LoadCase[] = [
      { id: "roof", label: `Roof: ${f.dead}D + ${f.live}L`, q: [dRoof, lRoof], factors: [f.dead, f.live], service: [1, 1] },
      { id: "roof14", label: "Roof: 1.4D", q: [dRoof, lRoof], factors: [1.4, 0], service: [1, 0] },
    ];
    const hR = tr * 1000;
    // Load downward = positive: front face = bottom (span), back face = top (supports).
    const roofSection = (face: TankFace) =>
      face === "frontY" || face === "frontX"
        ? slabSection(hR, b.roofBottom, b.roofTop, face === "frontY")
        : slabSection(hR, b.roofTop, b.roofBottom, face === "backY");
    panels.push(panelDesign("roof", "Roof slab", lc, wc, roofSol, roofCases, roofSection, null, roofEdges));
  }

  // ---- Checks ---------------------------------------------------------------------------------
  const checks: TankCheck[] = [];
  const push = (ck: Omit<TankCheck, "dcr"> & { dcr?: number | null }) =>
    checks.push({ ...ck, dcr: ck.dcr === undefined ? (ck.capacity > 0 ? ck.demand / ck.capacity : Infinity) : ck.dcr });
  if (uplift > 0)
    push({ id: "flotation", group: "Stability", label: "Flotation (empty tank, groundwater)", demand: flotation.required, capacity: flotation.fs, unit: "FS", detail: `FS = ΣW / U = ${resisting.toFixed(0)} / ${uplift.toFixed(0)} = ${flotation.fs.toFixed(2)} kN (required ${flotation.required.toFixed(2)})`, clause: clauses.flotation() });
  push({ id: "bearing", group: "Stability", label: "Bearing pressure (full tank, service)", demand: bearing.q, capacity: bearing.allowable, unit: "kPa", detail: `q = ΣW / A − uplift = ${bearing.q.toFixed(1)} kPa`, clause: clauses.bearing() });
  const faceLabel: Record<TankFace, string> = {
    frontY: "vertical / y bars, inside face",
    backY: "vertical / y bars, outside face",
    frontX: "horizontal / x bars, inside face",
    backX: "horizontal / x bars, outside face",
  };
  const slabFace = (panel: TankPanelId, face: TankFace) =>
    panel === "base"
      ? ({ frontY: "y bars, top", backY: "y bars, bottom", frontX: "x bars, top", backX: "x bars, bottom" } as const)[face]
      : panel === "roof"
        ? ({ frontY: "y bars, bottom", backY: "y bars, top", frontX: "x bars, bottom", backX: "x bars, top" } as const)[face]
        : faceLabel[face];
  for (const p of panels) {
    const group = p.id === "base" ? "Base Slab" : p.id === "roof" ? "Roof Slab" : "Walls";
    for (const pk of p.peaks)
      push({
        id: `fl:${p.id}:${pk.face}`,
        group,
        label: `${p.label} · ${slabFace(p.id, pk.face)} · flexure${pk.nu > 0 ? " + tension" : ""} (Sd)`,
        demand: pk.sd * pk.mu,
        capacity: pk.phiMn,
        unit: "kN·m/m",
        detail: `${pk.case}; x ${pk.x.toFixed(2)}, y ${pk.y.toFixed(2)} m; Mu ${pk.mu.toFixed(1)}, Ms ${pk.ms.toFixed(1)}, γ ${pk.gamma.toFixed(2)}, fs,max ${pk.fsMax.toFixed(0)} MPa → Sd ${pk.sd.toFixed(2)}${pk.nu > 0 ? `; Nu ${pk.nu.toFixed(1)} kN/m (×Sd)` : ""}`,
        clause: pk.nu > 0 ? clauses.flexureTension() : clauses.flexure(),
      });
  }
  // Shear: base / edge of each panel, both directions.
  const root = slabSqrtFc(i.fc);
  const shear = (p: TankPanelResult, sol: ReturnType<typeof solvePanel>, cases: LoadCase[], d: number, h: number, tension: ((y: number, c: LoadCase) => number) | null) => {
    let best = { dcr: -1, vu: 0, phiVc: 0, where: "", case: "" };
    for (let a = 0; a <= nx; a++)
      for (let bb = 0; bb <= ny; bb++) {
        const x = (p.length * a) / nx,
          y = (p.height * bb) / ny;
        // Shear at d from the supports.
        const nearEdge = Math.min(x, p.length - x) <= d / 1000 + p.length / nx || y <= d / 1000 + p.height / ny || p.height - y <= d / 1000 + p.height / ny;
        if (!nearEdge) continue;
        const xs = Math.min(Math.max(x, d / 1000), p.length - d / 1000),
          ys = Math.min(Math.max(y, d / 1000), p.height - d / 1000);
        const fields = cases[0]!.q.map((_, n) => sol.at(n, xs, ys));
        for (const lc of cases) {
          const fu = combine(fields, lc.factors);
          const nu = tension ? tension(ys, lc) : 0;
          for (const [v, dir] of [
            [Math.abs(fu.qy), "y"],
            [Math.abs(fu.qx), "x"],
          ] as const) {
            // Vc (1 + Nu/(3.5 Ag)) with Nu < 0 in tension: Nu/Ag = nu·1000 N / (h·1000 mm²).
            const factor = dir === "x" && nu > 0 ? Math.max(0, 1 - nu / (3.5 * h)) : 1;
            const phiVc = (0.75 * 0.17 * factor * root * 1000 * d) / 1000;
            if (v / phiVc > best.dcr) best = { dcr: v / phiVc, vu: v, phiVc, where: `x ${xs.toFixed(2)}, y ${ys.toFixed(2)} m (${dir === "y" ? "vertical / y spanning" : "horizontal / x spanning"})`, case: lc.label };
          }
        }
      }
    return best;
  };
  const wallD = dH(b.horizontalInside, b.verticalInside);
  for (const [p, sol, cases, d, h, tension] of [
    [panels[0]!, wallSols.long, wallCases, wallD, hW, (y: number, lcse: LoadCase) => edgeTension(wallSols.short, y, lcse)],
    [panels[1]!, wallSols.short, wallCases, wallD, hW, (y: number, lcse: LoadCase) => edgeTension(wallSols.long, y, lcse)],
    [panels[2]!, baseSol, baseCases, hB - c - b.baseBottom.diameter * 1.5, hB, null],
  ] as const) {
    const v = shear(p, sol, cases as LoadCase[], d, h, tension);
    push({ id: `sh:${p.id}`, group: p.id === "base" ? "Base Slab" : "Walls", label: `${p.label} · one-way shear at d from supports`, demand: v.vu, capacity: v.phiVc, unit: "kN/m", detail: `${v.case}; ${v.where}; d ${d.toFixed(0)} mm${p.id !== "base" ? "; Vc reduced for direct tension" : ""}`, clause: clauses.shear() });
  }
  // Detailing.
  const rhoST = tankShrinkageRatio(i.fy, i.jointSpacing);
  for (const [label, h, bars] of [
    ["Walls · vertical", hW, [b.verticalInside, b.verticalOutside]],
    ["Walls · horizontal", hW, [b.horizontalInside, b.horizontalOutside]],
    ["Base slab · each direction", hB, [b.baseTop, b.baseBottom]],
    ...(i.roof.enabled ? ([["Roof slab · each direction", tr * 1000, [b.roofBottom, b.roofTop]]] as const) : []),
  ] as const) {
    const req = rhoST * h * 1000;
    const prov = tankBarArea(bars[0]) + tankBarArea(bars[1]);
    push({ id: `st:${label}`, group: "Detailing", label: `${label} · shrinkage and temperature steel`, demand: req, capacity: prov, unit: "mm²/m", detail: `ρ ${rhoST} × ${h.toFixed(0)} mm (joints @ ${i.jointSpacing} m, fy ${i.fy} MPa); each face ≥ half`, clause: clauses.shrinkage() });
    push({ id: `stf:${label}`, group: "Detailing", label: `${label} · each face ≥ half the S&T steel`, demand: req / 2, capacity: Math.min(tankBarArea(bars[0]), tankBarArea(bars[1])), unit: "mm²/m", detail: "Smaller face", clause: clauses.shrinkage() });
  }
  const allBars = Object.entries(b) as [string, TankBar][];
  const maxSp = Math.max(...allBars.filter(([k2]) => i.roof.enabled || !k2.startsWith("roof")).map(([, x]) => x.spacing));
  push({ id: "spacing", group: "Detailing", label: "Bar spacing · maximum", demand: maxSp, capacity: 300, unit: "mm", detail: "Largest spacing of all bars ≤ 300 mm", clause: clauses.spacing() });
  push({ id: "cover", group: "Detailing", label: "Concrete cover · liquid and earth faces", demand: 50, capacity: i.cover, unit: "mm", detail: `Cover ${i.cover} mm ≥ 50 mm`, clause: clauses.cover() });
  if (H >= 3)
    push({ id: "thickness", group: "Detailing", label: "Wall thickness · minimum (H ≥ 3 m)", demand: 300, capacity: hW, unit: "mm", detail: `t ${hW.toFixed(0)} mm ≥ 300 mm`, clause: clauses.thickness() });

  // ---- Warnings --------------------------------------------------------------------------------
  if (i.liquid.depth > 0 && hwClear > 0)
    warnings.push("Walls are designed for the leak test (full, no backfill) and the empty backfilled case separately; the operating case (full and backfilled) normally governs neither.");
  if (s.water > 0)
    warnings.push("Flotation uses the empty tank without live load; uplift on the base projection is balanced by the water and buoyant soil above it.");
  warnings.push("Wall corners are fixed (monolithic); base and roof span between wall centrelines. Panel interaction at the corners is not iterated.");
  warnings.push("Seismic (ACI 350.3 hydrodynamic pressures, sloshing and dynamic earth pressure) is not included in this release.");
  warnings.push("fs,max for two-way action uses the one-way flexure expression; combined flexure and tension uses the direct-tension limit.");
  warnings.push("Joints, waterstops, construction sequence and leakage testing criteria (ACI 350.1) require separate review.");

  return {
    engine: TANK_ENGINE,
    geometry: { lc, wc, outerX, outerY, baseX, baseY, hw: s.water, k },
    panels,
    flotation,
    bearing,
    checks,
    warnings,
  };
}

export function tankDesignChecks(r: TankResult): DesignCheck[] {
  return r.checks.map(({ id, label, dcr, detail, clause }) => ({ id, label, dcr, detail, clause }));
}

export const tankSectionOrder: TankCheck["group"][] = ["Stability", "Walls", "Base Slab", "Roof Slab", "Detailing"];
export const tankSectionTitles: Record<TankCheck["group"], string> = {
  Stability: "Stability Checks (Flotation, Bearing)",
  Walls: "Reinforcement Checks — Walls",
  "Base Slab": "Reinforcement Checks — Base Slab",
  "Roof Slab": "Reinforcement Checks — Roof Slab",
  Detailing: "Reinforcement Checks — Detailing (ACI 350)",
};
export function tankCheckSections(r: TankResult) {
  return tankSectionOrder
    .map((title) => {
      const list = r.checks.filter((x) => x.group === title);
      const dcrs = list.map((x) => x.dcr).filter((d): d is number => d !== null && Number.isFinite(d));
      return { title, checks: tankDesignChecks({ ...r, checks: list }), governing: dcrs.length ? Math.max(...dcrs) : null };
    })
    .filter((x) => x.checks.length > 0);
}
export function tankStatus(r: TankResult, dcrLimit = 1) {
  const worst = r.checks.reduce((m, x) => Math.max(m, x.dcr ?? 0), 0);
  return { worst, pass: worst <= dcrLimit + 1e-9 };
}
