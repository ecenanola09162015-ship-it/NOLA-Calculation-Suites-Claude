/**
 * Full-width stem plate (Phase 2): the stem as an L × H Kirchhoff plate with
 * its real edge restraints and buttresses, under the same depth-varying
 * pressure components as the 1 m strip. Design moments by Wood–Armer from the
 * factored combinations; the governing point is the largest DCR, not the
 * largest moment, because d and the bars change with height.
 *
 * ACI 318-19 13.3.7.2†: the stem of a counterfort or buttressed wall is
 * designed as a two-way slab (Ch. 8). Moments are elastic (no redistribution).
 */
import type { RetainingWallCombination, RetainingWallInput } from "./retaining-wall";
import type { PressureComponent, PressureKind } from "./retaining-wall-pressure";
import {
  solveWallPlate,
  woodArmer,
  type PlateEdge,
  type PlateField,
  type WallPlateSupports,
} from "./retaining-wall-plate-fe";

export type PlateDemandId = "backY" | "frontY" | "backX" | "frontX";
export const plateDemandLabels: Record<PlateDemandId, string> = {
  backY: "Vertical bars, back face (soil side)",
  frontY: "Vertical bars, front face",
  backX: "Horizontal bars, back face (soil side)",
  frontX: "Horizontal bars, front face",
};
export interface PlatePeak {
  id: PlateDemandId | "shearY" | "shearX";
  demand: number;
  capacity: number;
  dcr: number;
  x: number;
  y: number;
  combo: string;
}
export interface WallPlateResult {
  length: number;
  height: number;
  supports: WallPlateSupports;
  mesh: { xs: number[]; ys: number[]; dof: number };
  peaks: PlatePeak[];
  /** Strength envelope of a design quantity at (x, y), kN·m/m (moments) or mm (w, service). */
  field: (kind: PlateDemandId | "w", x: number, y: number) => number;
  /** Peak strip-equivalent base moment from the 1 m strip, for comparison. */
  notes: string[];
  /** FE line reactions on each buttress (rigid line support), factored per strength combination. */
  buttressReactions: { x: number; height: number; ys: number[]; combos: { combo: string; force: number[] }[] }[];
}

export interface PlateCapacity {
  /** φMn per face and direction at height y, kN·m/m. */
  flexure: (id: PlateDemandId, y: number) => number;
  /** φVc for vertical (shearY) and horizontal (shearX) spanning at height y, kN/m. */
  shear: (dir: "shearY" | "shearX", y: number) => number;
}

export function plateSupports(i: RetainingWallInput): WallPlateSupports {
  const H = i.height;
  let top: PlateEdge = i.plate.top,
    base: PlateEdge = i.plate.base;
  const horizontal: number[] = [];
  if (i.wallType === "basement") {
    top = i.basement.top;
    base = i.basement.base;
  } else if (i.wallType === "propped") {
    if (i.prop.height >= H - 1e-6) top = "pinned";
    else horizontal.push(i.prop.height);
  }
  return {
    base,
    top,
    left: i.plate.left,
    right: i.plate.right,
    vertical: i.plate.buttresses.map((b) => ({ x: b.x, height: Math.min(b.height, H) })),
    horizontal,
  };
}

export function analyseWallPlate(
  i: RetainingWallInput,
  components: PressureComponent[],
  strength: RetainingWallCombination[],
  factor: (c: RetainingWallCombination, kind: PressureKind) => number,
  capacity: PlateCapacity,
  flexuralRigidity: number,
): WallPlateResult {
  const L = i.plate.length,
    H = i.height,
    supports = plateSupports(i);
  const loaded = components.filter((c) => c.id !== "axialD" && c.id !== "axialL");
  const sol = solveWallPlate(
    L,
    H,
    0.2,
    supports,
    loaded.map((c) => ({ q: (_x: number, y: number) => c.p(H - y), breaks: c.breaks.map((z) => H - z) })),
    i.plate.divisions,
  );
  const fields = (x: number, y: number) => loaded.map((_, k) => sol.at(k, x, y));
  const combine = (f: PlateField[], combo: RetainingWallCombination) => {
    let mx = 0,
      my = 0,
      mxy = 0,
      qx = 0,
      qy = 0,
      w = 0;
    loaded.forEach((c, k) => {
      const a = factor(combo, c.kind),
        v = f[k]!;
      mx += a * v.mx;
      my += a * v.my;
      mxy += a * v.mxy;
      qx += a * v.qx;
      qy += a * v.qy;
      w += a * v.w;
    });
    return { mx, my, mxy, qx, qy, w };
  };
  const demand = (id: PlateDemandId, x: number, y: number) => {
    const f = fields(x, y);
    let best = 0,
      combo = strength[0]?.id ?? "";
    for (const c of strength) {
      const m = combine(f, c),
        wa = woodArmer(m.mx, m.my, m.mxy);
      const v = id === "backY" ? wa.backY : id === "frontY" ? wa.frontY : id === "backX" ? wa.backX : wa.frontX;
      if (v > best) {
        best = v;
        combo = c.id;
      }
    }
    return { value: best, combo };
  };
  // Sample on the mesh lines plus element mid-lines.
  const mids = (lines: number[]) => {
    const out: number[] = [];
    lines.forEach((v, k) => {
      out.push(v);
      if (k + 1 < lines.length) out.push((v + lines[k + 1]!) / 2);
    });
    return out;
  };
  const sx = mids(sol.xs),
    sy = mids(sol.ys);
  const avg = i.plate.averaging === "1m";
  const peaks: PlatePeak[] = [];
  for (const id of ["backY", "frontY", "backX", "frontX"] as PlateDemandId[]) {
    let best: PlatePeak = { id, demand: 0, capacity: capacity.flexure(id, 0), dcr: 0, x: 0, y: 0, combo: "" };
    for (const x of sx)
      for (const y of sy) {
        const d = demand(id, x, y);
        if (d.value <= 0) continue;
        const cap = capacity.flexure(id, y),
          dcr = cap > 0 ? d.value / cap : Infinity;
        if (dcr > best.dcr) best = { id, demand: d.value, capacity: cap, dcr, x, y, combo: d.combo };
      }
    if (avg && best.demand > 0) {
      // Average over 1 m along the bar-distribution direction, centred on the peak.
      const along = id.endsWith("Y") ? "x" : "y",
        span = along === "x" ? L : H,
        c0 = along === "x" ? best.x : best.y,
        a = Math.max(0, c0 - 0.5),
        b = Math.min(span, c0 + 0.5);
      let s = 0;
      const n = 20;
      for (let k = 0; k <= n; k++) {
        const t = a + ((b - a) * k) / n,
          d = demand(id, along === "x" ? t : best.x, along === "x" ? best.y : t).value;
        s += d * (k === 0 || k === n ? 0.5 : 1);
      }
      best.demand = s / n;
      best.dcr = best.capacity > 0 ? best.demand / best.capacity : Infinity;
    }
    peaks.push(best);
  }
  // Shear: vertical spanning at the base (and top/prop lines), horizontal spanning at end walls and buttresses.
  const shearPeak = (dir: "shearY" | "shearX", pts: [number, number][]) => {
    let best: PlatePeak = { id: dir, demand: 0, capacity: capacity.shear(dir, 0), dcr: 0, x: 0, y: 0, combo: "" };
    for (const [x, y] of pts) {
      const f = fields(x, y);
      for (const c of strength) {
        const m = combine(f, c),
          v = Math.abs(dir === "shearY" ? m.qy : m.qx),
          cap = capacity.shear(dir, y),
          dcr = cap > 0 ? v / cap : Infinity;
        if (dcr > best.dcr) best = { id: dir, demand: v, capacity: cap, dcr, x, y, combo: c.id };
      }
    }
    return best;
  };
  const baseRow: [number, number][] = sx.map((x) => [x, 0]);
  const sideLines = [
    ...(supports.left !== "free" ? [0] : []),
    ...(supports.right !== "free" ? [L] : []),
    ...supports.vertical.map((b) => b.x),
  ];
  const sidePts: [number, number][] = sideLines.flatMap((x) =>
    sy.filter((y) => y > 0 && y < H).map((y) => [x, y] as [number, number]),
  );
  peaks.push(shearPeak("shearY", baseRow));
  if (sidePts.length) peaks.push(shearPeak("shearX", sidePts));
  const field = (kind: PlateDemandId | "w", x: number, y: number) => {
    if (kind !== "w") return demand(kind, x, y).value;
    const f = fields(x, y);
    let w = 0;
    for (const c of strength) w = Math.max(w, Math.abs(combine(f, c).w));
    return (w / flexuralRigidity) * 1000; // mm, factored
  };
  const notes = [
    "Stem analysed as an elastic Kirchhoff plate (BFS elements, ν = 0.2); design moments by Wood–Armer, no redistribution.",
    i.plate.averaging === "1m"
      ? "Design moments averaged over 1 m beside the peak along the bar-distribution direction."
      : "Design moments are peak elastic values.",
    "Footing and external stability remain per metre from the strip analysis (conservative where end restraints relieve the base).",
  ];
  if (components.some((c) => c.id === "axialD" || c.id === "axialL"))
    notes.push("The stem-top line-load eccentric moment is carried in the strip analysis only; review it for the plate.");
  if (supports.vertical.length)
    notes.push("Buttresses act as rigid line supports; their FE line reactions load the counterfort design.");
  const buttressReactions = sol.lineReactions.map((ln, b) => ({
    x: ln.x,
    height: supports.vertical[b]!.height,
    ys: ln.ys,
    combos: strength.map((combo) => ({
      combo: combo.id,
      force: ln.ys.map((_, j) => -loaded.reduce((sum, c, k) => sum + factor(combo, c.kind) * ln.force[k]![j]!, 0)),
    })),
  }));
  return { length: L, height: H, supports, mesh: { xs: sol.xs, ys: sol.ys, dof: sol.dof }, peaks, field, notes, buttressReactions };
}
