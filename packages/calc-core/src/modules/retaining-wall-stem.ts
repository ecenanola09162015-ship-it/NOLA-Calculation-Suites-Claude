/**
 * Stem analysis per metre: Euler–Bernoulli member, y up from the top of the
 * footing (m), pressure p(y) acting towards the front (kPa = kN/m per m).
 * Direct stiffness with Hermite elements (v, θ = dv/dy), EI from the tapered
 * thickness, consistent loads by Gauss integration. Supports: base fixed or
 * pinned; prop at hp (rigid or spring); top slab fixed or pinned.
 *
 * Internal actions come from statics on the free body above each section, using
 * the support reactions of the FE solution, so moments are exact for the load
 * whatever the mesh: M > 0 = tension on the back (soil) face.
 *
 * Benchmarks (test/retaining-wall-stem.test.ts): cantilever PH/3; propped
 * R = P/5, M = 2PH/15 (triangular) and 3P/8, PH/8 (uniform); fixed–fixed
 * R = 3P/10 + 7P/10, M = PH/15, PH/10, +M = 0.0214wH² at 0.548H from the top.
 */
import { integrate } from "./retaining-wall-pressure";

export interface StemSupports {
  base: "fixed" | "pinned";
  /** Top support (basement wall), or none. */
  top: "fixed" | "pinned" | "none";
  /** Prop at height y (rigid when stiffness is null). */
  prop: { y: number; stiffness: number | null } | null;
}
export interface StemLoad {
  p: (y: number) => number;
  /** Heights with kinks in p. */
  breaks: number[];
  /** Couple applied at the stem top, tension on the back face > 0 (kN·m/m). */
  couple?: number;
  /** Determinate moment added at each height (tension back > 0). */
  extraMoment?: (y: number) => number;
}
export interface StemSolution {
  /** Horizontal reaction at the base (towards the back, kN/m), magnitude of shear. */
  baseShear: number;
  /** Base moment (tension back > 0), kN·m/m. */
  baseMoment: number;
  /** Reaction at the prop (kN/m, resisting = positive) or null. */
  prop: number | null;
  /** Reaction at the top slab (kN/m, resisting = positive) or null. */
  topForce: number | null;
  /** Top fixed-end moment, tension back > 0. */
  topMoment: number | null;
  /** Moment and shear at height y. */
  moment: (y: number) => number;
  shear: (y: number) => number;
}

function solveDense(a: number[][], b: number[]) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    if (Math.abs(a[piv]![c]!) < 1e-14)
      throw new Error("Stem analysis is unstable. Review the supports.");
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    [b[c], b[piv]] = [b[piv]!, b[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = a[r]![c]! / a[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k < n; k++) a[r]![k]! -= f * a[c]![k]!;
      b[r]! -= f * b[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= a[r]![k]! * x[k]!;
    x[r] = s / a[r]![r]!;
  }
  return x;
}

/**
 * @param height stem height H, m
 * @param ei flexural rigidity at height y, kN·m²/m
 */
export function solveStem(
  height: number,
  ei: (y: number) => number,
  supports: StemSupports,
  load: StemLoad,
  divisions = 60,
): StemSolution {
  const H = height;
  const ys = new Set<number>();
  for (let k = 0; k <= divisions; k++) ys.add((H * k) / divisions);
  if (supports.prop) ys.add(Math.min(H, Math.max(0, supports.prop.y)));
  const nodes = [...ys].sort((a, b) => a - b).filter(
    (y, k, arr) => k === 0 || y - arr.at(k - 1)! > H * 1e-6,
  );
  const n = nodes.length,
    dof = 2 * n;
  const K = Array.from({ length: dof }, () => new Array<number>(dof).fill(0));
  const F = new Array<number>(dof).fill(0);
  const G = [
    [-0.861136311594053, 0.347854845137454],
    [-0.339981043584856, 0.652145154862546],
    [0.339981043584856, 0.652145154862546],
    [0.861136311594053, 0.347854845137454],
  ];
  for (let e = 0; e + 1 < n; e++) {
    const y0 = nodes.at(e)!,
      h = nodes.at(e + 1)! - y0,
      EI = ei(y0 + h / 2),
      c = EI / h ** 3;
    const ke = [
      [12, 6 * h, -12, 6 * h],
      [6 * h, 4 * h * h, -6 * h, 2 * h * h],
      [-12, -6 * h, 12, -6 * h],
      [6 * h, 2 * h * h, -6 * h, 4 * h * h],
    ];
    const map = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let r = 0; r < 4; r++)
      for (let q = 0; q < 4; q++) K[map[r]!]![map[q]!]! += c * ke[r]![q]!;
    for (const [x, w] of G) {
      const s = (x! + 1) / 2,
        p = load.p(y0 + s * h),
        N = [
          1 - 3 * s * s + 2 * s ** 3,
          h * (s - 2 * s * s + s ** 3),
          3 * s * s - 2 * s ** 3,
          h * (-s * s + s ** 3),
        ];
      for (let r = 0; r < 4; r++) F[map[r]!]! += (w! * h * p * N[r]!) / 2;
    }
  }
  if (load.couple) F[2 * (n - 1) + 1]! += load.couple;
  const fixed = new Set<number>([0]);
  if (supports.base === "fixed") fixed.add(1);
  const top = n - 1;
  if (supports.top !== "none") {
    fixed.add(2 * top);
    if (supports.top === "fixed") fixed.add(2 * top + 1);
  }
  let propNode = -1;
  if (supports.prop) {
    const py = supports.prop.y;
    propNode = nodes.findIndex((y) => Math.abs(y - py) < H * 1e-6);
    if (supports.prop.stiffness === null) fixed.add(2 * propNode);
    else K[2 * propNode]![2 * propNode]! += supports.prop.stiffness;
  }
  const Korig = K.map((r) => [...r]);
  const free = [...Array(dof).keys()].filter((d) => !fixed.has(d));
  const u = new Array<number>(dof).fill(0);
  const sol = solveDense(
    free.map((r) => free.map((c) => K[r]![c]!)),
    free.map((r) => F[r]!),
  );
  free.forEach((d, k) => (u[d] = sol[k]!));
  // Reaction (force from the support on the wall, +v towards the front).
  const reaction = (d: number) =>
    Korig[d]!.reduce((s, kij, j) => s + kij * u[j]!, 0) - F[d]!;
  const springForce = (d: number) =>
    supports.prop?.stiffness != null ? -supports.prop.stiffness * u[d]! : 0;
  let propR: number | null = null,
    topR: number | null = null,
    topM: number | null = null;
  if (supports.prop)
    propR =
      supports.prop.stiffness === null
        ? reaction(2 * propNode)
        : springForce(2 * propNode);
  if (supports.top !== "none") {
    topR = reaction(2 * top);
    if (supports.top === "fixed") topM = reaction(2 * top + 1);
  }
  // Point actions above a section: forces at heights (in +v) and a top couple.
  const pointForces: [number, number][] = [];
  if (propR !== null && supports.prop) pointForces.push([nodes.at(propNode)!, propR]);
  if (topR !== null) pointForces.push([H, topR]);
  const couple = (topM ?? 0) + (load.couple ?? 0);
  const moment = (y: number) => {
    const yy = Math.min(Math.max(y, 0), H);
    let m = integrate((s) => load.p(s) * (s - yy), yy, H, load.breaks, 6);
    for (const [s, f] of pointForces) if (s > yy + 1e-12) m += f * (s - yy);
    if (yy < H - 1e-12) m += couple;
    if (load.extraMoment) m += load.extraMoment(yy);
    return m;
  };
  const shear = (y: number) => {
    const yy = Math.min(Math.max(y, 0), H);
    let v = integrate(load.p, yy, H, load.breaks, 6);
    for (const [s, f] of pointForces) if (s > yy + 1e-12) v += f;
    return v;
  };
  return {
    baseShear: shear(0),
    baseMoment: moment(0),
    prop: propR === null ? null : -propR,
    topForce: topR === null ? null : -topR,
    topMoment: topM === null ? null : moment(H - 1e-9),
    moment,
    shear,
  };
}
