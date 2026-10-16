/**
 * Kirchhoff plate finite elements for a retaining wall stem (Phase 2).
 *
 * Wall-owned copy of the Slab module's Bogner–Fox–Schmit 16-DOF conforming
 * rectangle (nodal w, w,x, w,y, w,xy; bicubic Hermite shape functions,
 * 4×4 Gauss, banded Cholesky) so the Slab module is not changed. Additions:
 *  - distributed load q(x, y) integrated per element (any depth-varying
 *    pressure), several right-hand sides on one factorisation;
 *  - each edge Free / Pinned / Fixed: base y = 0, top y = H, ends x = 0, L;
 *  - internal line supports: vertical lines x = xi for 0 ≤ y ≤ hi
 *    (buttresses / counterforts) and horizontal lines y = yj (props);
 *  - Wood–Armer design moments.
 *
 * Axes: x along the wall (0…L), y up from the stem base (0…H), w positive in
 * the load direction (towards the front). D = 1, so moments are in kN·m/m for
 * loads in kPa. Positive moments put the far (front) face in tension;
 * negative moments put the loaded (back, soil) face in tension.
 *
 * Verification (test/retaining-wall-plate.test.ts): Navier series for
 * simply supported plates under uniform and hydrostatic load; clamped square
 * (Timoshenko & Woinowsky-Krieger); long-wall strip limits (cantilever PH/3,
 * propped 2PH/15); closely spaced buttresses (horizontal spanning qs²/12).
 */
export type PlateEdge = "free" | "pinned" | "fixed";
export interface WallPlateSupports {
  base: PlateEdge;
  top: PlateEdge;
  left: PlateEdge;
  right: PlateEdge;
  /** Vertical line supports (buttresses) at x, from the base up to height. */
  vertical: { x: number; height: number }[];
  /** Horizontal line supports (props) at height y over the full length. */
  horizontal: number[];
}
export interface WallPlateLoad {
  /** Pressure at (x, y), kPa, positive towards the front. */
  q: (x: number, y: number) => number;
  /** Heights where q has kinks (water table, strip edges), for mesh lines. */
  breaks?: number[];
}
export interface PlateField {
  w: number;
  mx: number;
  my: number;
  mxy: number;
  qx: number;
  qy: number;
}
export interface WallPlateSolution {
  xs: number[];
  ys: number[];
  dof: number;
  at: (k: number, x: number, y: number) => PlateField;
}

function hermite(s: number, h: number, d: number): number[] {
  switch (d) {
    case 0:
      return [1 - 3 * s * s + 2 * s ** 3, h * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, h * (-s * s + s ** 3)];
    case 1:
      return [(-6 * s + 6 * s * s) / h, 1 - 4 * s + 3 * s * s, (6 * s - 6 * s * s) / h, -2 * s + 3 * s * s];
    case 2:
      return [(-6 + 12 * s) / h ** 2, (-4 + 6 * s) / h, (6 - 12 * s) / h ** 2, (-2 + 6 * s) / h];
    default:
      return [12 / h ** 3, 6 / h ** 2, -12 / h ** 3, 6 / h ** 2];
  }
}
const GAUSS4: [number, number][] = (() => {
  const a = Math.sqrt(3 / 7 - (2 / 7) * Math.sqrt(6 / 5)),
    b = Math.sqrt(3 / 7 + (2 / 7) * Math.sqrt(6 / 5)),
    wa = (18 + Math.sqrt(30)) / 36,
    wb = (18 - Math.sqrt(30)) / 36;
  return ([
    [-b, wb],
    [-a, wa],
    [a, wa],
    [b, wb],
  ] as const).map(([x, w]) => [(x + 1) / 2, w / 2]);
})();
function shape(sx: number, sy: number, hx: number, hy: number, dx: number, dy: number) {
  const X = hermite(sx, hx, dx),
    Y = hermite(sy, hy, dy),
    out = new Float64Array(16);
  for (let ix = 0; ix < 4; ix++)
    for (let iy = 0; iy < 4; iy++) out[((ix >> 1) + 2 * (iy >> 1)) * 4 + (ix & 1) + 2 * (iy & 1)] = X[ix]! * Y[iy]!;
  return out;
}
function elementStiffness(hx: number, hy: number, nu: number) {
  const ke = new Float64Array(256);
  for (const [sx, wx] of GAUSS4)
    for (const [sy, wy] of GAUSS4) {
      const bxx = shape(sx, sy, hx, hy, 2, 0),
        byy = shape(sx, sy, hx, hy, 0, 2),
        bxy = shape(sx, sy, hx, hy, 1, 1),
        w = wx * wy * hx * hy;
      for (let r = 0; r < 16; r++)
        for (let c = r; c < 16; c++)
          ke[r * 16 + c]! +=
            w * (bxx[r]! * bxx[c]! + byy[r]! * byy[c]! + nu * (bxx[r]! * byy[c]! + byy[r]! * bxx[c]!) + 2 * (1 - nu) * bxy[r]! * bxy[c]!);
    }
  return ke;
}
/** Mesh lines on [0, length]: `base` divisions graded at both ends, plus forced lines. */
export function wallMeshLines(length: number, base: number, forced: number[]) {
  const pts: number[] = [];
  for (let k = 0; k <= base; k++) pts.push((length * k) / base);
  for (const f of [0.25, 0.5]) {
    pts.push((length * f) / base, length - (length * f) / base);
  }
  const h = length / base;
  for (const v of forced)
    if (v > 0 && v < length) pts.push(v, Math.max(0, v - h * 0.35), Math.min(length, v + h * 0.35));
  pts.sort((a, b) => a - b);
  const tol = length * 2e-3,
    out = [0];
  for (const v of pts) if (v - out.at(-1)! > tol) out.push(v);
  out[out.length - 1] = length;
  for (const v of forced) {
    // Snap the nearest line exactly onto each forced position.
    if (!(v > 0 && v < length)) continue;
    let k = 0;
    for (let j = 1; j < out.length; j++) if (Math.abs(out[j]! - v) < Math.abs(out[k]! - v)) k = j;
    out[k] = v;
  }
  return out;
}

/**
 * Solve the wall plate for several loads with one factorisation.
 * @param divisionsH divisions over the height (default 16).
 */
export function solveWallPlate(
  L: number,
  H: number,
  nu: number,
  supports: WallPlateSupports,
  loads: WallPlateLoad[],
  divisionsH = 16,
): WallPlateSolution {
  const nH = divisionsH,
    nL = Math.min(64, Math.max(8, Math.round((nH * L) / H)));
  const xs = wallMeshLines(L, nL, supports.vertical.map((b) => b.x));
  const ys = wallMeshLines(H, nH, [
    ...supports.vertical.map((b) => b.height),
    ...supports.horizontal,
    ...loads.flatMap((l) => l.breaks ?? []),
  ]);
  const xMajor = xs.length <= ys.length,
    nx = xs.length,
    ny = ys.length,
    dof = nx * ny * 4,
    node = (i: number, j: number) => (xMajor ? j * nx + i : i * ny + j) * 4,
    bw = 4 * ((xMajor ? nx : ny) + 2);
  const K = new Float64Array(dof * bw),
    F = loads.map(() => new Float64Array(dof)),
    keCache = new Map<string, Float64Array>();
  for (let ej = 0; ej < ny - 1; ej++)
    for (let ei = 0; ei < nx - 1; ei++) {
      const hx = xs[ei + 1]! - xs[ei]!,
        hy = ys[ej + 1]! - ys[ej]!,
        key = `${hx.toPrecision(12)}:${hy.toPrecision(12)}`;
      let ke = keCache.get(key);
      if (!ke) {
        ke = elementStiffness(hx, hy, nu);
        keCache.set(key, ke);
      }
      const map: number[] = [];
      for (const [a, b] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        for (let k = 0; k < 4; k++) map.push(node(ei + a!, ej + b!) + k);
      for (let r = 0; r < 16; r++)
        for (let c = r; c < 16; c++) {
          const a = map[r]!,
            b = map[c]!,
            v = ke[r * 16 + c]!;
          if (b >= a) K[a * bw + (b - a)]! += v;
          else K[b * bw + (a - b)]! += v;
        }
      for (const [sx, wx] of GAUSS4)
        for (const [sy, wy] of GAUSS4) {
          const n = shape(sx, sy, hx, hy, 0, 0),
            x = xs[ei]! + sx * hx,
            y = ys[ej]! + sy * hy,
            w = wx * wy * hx * hy;
          loads.forEach((l, k) => {
            const q = l.q(x, y);
            if (q === 0) return;
            for (let r = 0; r < 16; r++) F[k]![map[r]!]! += w * q * n[r]!;
          });
        }
    }
  const fixed = new Uint8Array(dof);
  const eps = 1e-9;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const d = node(i, j),
        x = xs[i]!,
        y = ys[j]!;
      const xEdge = i === 0 ? supports.left : i === nx - 1 ? supports.right : "free",
        yEdge = j === 0 ? supports.base : j === ny - 1 ? supports.top : "free";
      if (xEdge !== "free") {
        fixed[d] = fixed[d + 2] = 1;
        if (xEdge === "fixed") fixed[d + 1] = fixed[d + 3] = 1;
      }
      if (yEdge !== "free") {
        fixed[d] = fixed[d + 1] = 1;
        if (yEdge === "fixed") fixed[d + 2] = fixed[d + 3] = 1;
      }
      for (const b of supports.vertical)
        if (Math.abs(x - b.x) < eps && y <= b.height + eps) {
          fixed[d] = 1;
          if (y < b.height - eps) fixed[d + 2] = 1;
        }
      for (const yp of supports.horizontal)
        if (Math.abs(y - yp) < eps) fixed[d] = fixed[d + 1] = 1;
    }
  for (let r = 0; r < dof; r++) {
    if (!fixed[r]) continue;
    for (let c = 0; c < bw; c++) K[r * bw + c] = 0;
    for (let c = 1; c < bw && r - c >= 0; c++) K[(r - c) * bw + c] = 0;
    K[r * bw] = 1;
    for (const f of F) f[r] = 0;
  }
  for (let r = 0; r < dof; r++) {
    for (let k = Math.max(0, r - bw + 1); k < r; k++) {
      const ukr = K[k * bw + (r - k)]!;
      if (ukr === 0) continue;
      const end = Math.min(dof, k + bw);
      for (let c = r; c < end; c++) K[r * bw + (c - r)]! -= ukr * K[k * bw + (c - k)]!;
    }
    const pivot = K[r * bw]!;
    if (!(pivot > 0)) throw new Error("Wall plate analysis is unstable. Review the edge restraints.");
    const s = Math.sqrt(pivot);
    for (let c = 0; c < bw && r + c < dof; c++) K[r * bw + c]! /= s;
  }
  const U = F.map((f) => {
    const y = Float64Array.from(f);
    for (let r = 0; r < dof; r++) {
      for (let k = Math.max(0, r - bw + 1); k < r; k++) y[r]! -= K[k * bw + (r - k)]! * y[k]!;
      y[r]! /= K[r * bw]!;
    }
    for (let r = dof - 1; r >= 0; r--) {
      for (let c = 1; c < bw && r + c < dof; c++) y[r]! -= K[r * bw + c]! * y[r + c]!;
      y[r]! /= K[r * bw]!;
    }
    return y;
  });
  const locate = (v: number, lines: number[]) => {
    let lo = 0,
      hi = lines.length - 2;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (lines[m]! <= v) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  const at = (k: number, x: number, y: number): PlateField => {
    const cx = Math.min(Math.max(x, 0), L),
      cy = Math.min(Math.max(y, 0), H),
      ei = locate(cx, xs),
      ej = locate(cy, ys),
      hx = xs[ei + 1]! - xs[ei]!,
      hy = ys[ej + 1]! - ys[ej]!,
      sx = (cx - xs[ei]!) / hx,
      sy = (cy - ys[ej]!) / hy,
      u = U[k]!;
    const X = [0, 1, 2, 3].map((d) => hermite(sx, hx, d)),
      Y = [0, 1, 2, 3].map((d) => hermite(sy, hy, d));
    const T = [0, 0, 0, 0].map(() => [0, 0, 0, 0]);
    for (let ix = 0; ix < 4; ix++)
      for (let iy = 0; iy < 4; iy++) {
        const c = u[node(ei + (ix >> 1), ej + (iy >> 1)) + (ix & 1) + 2 * (iy & 1)]!;
        for (let dy = 0; dy < 4; dy++) T[dy]![ix]! += Y[dy]![iy]! * c;
      }
    const ev = (dx: number, dy: number) =>
      X[dx]![0]! * T[dy]![0]! + X[dx]![1]! * T[dy]![1]! + X[dx]![2]! * T[dy]![2]! + X[dx]![3]! * T[dy]![3]!;
    const wxx = ev(2, 0),
      wyy = ev(0, 2);
    return {
      w: ev(0, 0),
      mx: -(wxx + nu * wyy),
      my: -(wyy + nu * wxx),
      mxy: -(1 - nu) * ev(1, 1),
      qx: -(ev(3, 0) + ev(1, 2)),
      qy: -(ev(2, 1) + ev(0, 3)),
    };
  };
  return { xs, ys, dof, at };
}

/**
 * Wood–Armer design moments (Wood 1968; Armer 1968), per face.
 * Front face (positive moments): Mx* = mx + |mxy|, My* = my + |mxy|, with the
 * standard correction when one is negative. Back face likewise on −m.
 * Returned values are ≥ 0 demand on each face.
 */
export function woodArmer(mx: number, my: number, mxy: number) {
  const a = Math.abs(mxy);
  const face = (x: number, y: number) => {
    let dx = x + a,
      dy = y + a;
    if (dx < 0 && dy < 0) return { x: 0, y: 0 };
    if (dx < 0) {
      dx = 0;
      dy = y + (a * a) / Math.abs(x || 1e-12);
    } else if (dy < 0) {
      dy = 0;
      dx = x + (a * a) / Math.abs(y || 1e-12);
    }
    return { x: Math.max(0, dx), y: Math.max(0, dy) };
  };
  const front = face(mx, my);
  const back = face(-mx, -my);
  return { frontX: front.x, frontY: front.y, backX: back.x, backY: back.y };
}
