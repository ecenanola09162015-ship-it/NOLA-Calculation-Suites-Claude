/**
 * Kirchhoff plate finite elements for rectangular patch loads.
 *
 * Bogner–Fox–Schmit 16-DOF conforming rectangles (nodal w, w,x, w,y, w,xy;
 * bicubic Hermite shape functions), 4×4 Gauss integration, graded tensor mesh
 * refined at every patch, banded Cholesky solve. Global axes: x west→east on
 * [0, lx], y south→north on [0, ly] (metres). Results are per unit total patch
 * load (P = 1) with flexural rigidity D = 1:
 *   w [m] × P/D,  mx, my, mxy [kN·m/m per kN],  qx, qy [kN/m per kN].
 * Sign convention matches the Ritz solver: w positive downward, positive
 * moments are sagging (bottom tension).
 *
 * Verification (test/slab-patch-fe.test.ts): Navier double series for simply
 * supported plates under patch loads; Timoshenko & Woinowsky-Krieger clamped
 * square under central load (w = 0.00560 Pa²/D, edge M = −0.1257 P).
 */
export interface PatchRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** true = clamped (Fixed), false = simply supported (Pinned). */
export interface PatchEdges {
  west: boolean;
  east: boolean;
  south: boolean;
  north: boolean;
}
export interface PatchFieldValue {
  w: number;
  mx: number;
  my: number;
  mxy: number;
  qx: number;
  qy: number;
}
export interface PatchSolution {
  xs: number[];
  ys: number[];
  dof: number;
  /** Field of patch k at global (x, y), per unit total load. */
  at: (k: number, x: number, y: number) => PatchFieldValue;
}

/** Hermite cubic values (d = 0) or derivatives (d = 1..3) on an element of length h, local s ∈ [0, 1]. */
function hermite(s: number, h: number, d: number): number[] {
  switch (d) {
    case 0:
      return [
        1 - 3 * s * s + 2 * s ** 3,
        h * (s - 2 * s * s + s ** 3),
        3 * s * s - 2 * s ** 3,
        h * (-s * s + s ** 3),
      ];
    case 1:
      return [
        (-6 * s + 6 * s * s) / h,
        1 - 4 * s + 3 * s * s,
        (6 * s - 6 * s * s) / h,
        -2 * s + 3 * s * s,
      ];
    case 2:
      return [
        (-6 + 12 * s) / h ** 2,
        (-4 + 6 * s) / h,
        (6 - 12 * s) / h ** 2,
        (-2 + 6 * s) / h,
      ];
    default:
      return [12 / h ** 3, 6 / h ** 2, -12 / h ** 3, 6 / h ** 2];
  }
}
/** 4-point Gauss–Legendre rule mapped to [0, 1]. */
const GAUSS4: [number, number][] = (() => {
  const a = Math.sqrt(3 / 7 - (2 / 7) * Math.sqrt(6 / 5)),
    b = Math.sqrt(3 / 7 + (2 / 7) * Math.sqrt(6 / 5)),
    wa = (18 + Math.sqrt(30)) / 36,
    wb = (18 - Math.sqrt(30)) / 36;
  return (
    [
      [-b, wb],
      [-a, wa],
      [a, wa],
      [b, wb],
    ] as const
  ).map(([x, w]) => [(x + 1) / 2, w / 2]);
})();
/**
 * Element shape-function derivative ∂^(dx+dy)N/∂x^dx∂y^dy for the 16 element
 * DOFs: node order (0,0), (1,0), (0,1), (1,1); per node [w, w,x, w,y, w,xy].
 */
function shape(
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  dx: number,
  dy: number,
) {
  const X = hermite(sx, hx, dx),
    Y = hermite(sy, hy, dy),
    out = new Float64Array(16);
  for (let ix = 0; ix < 4; ix++)
    for (let iy = 0; iy < 4; iy++)
      out[((ix >> 1) + 2 * (iy >> 1)) * 4 + (ix & 1) + 2 * (iy & 1)] =
        X[ix] * Y[iy];
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
          ke[r * 16 + c] +=
            w *
            (bxx[r] * bxx[c] +
              byy[r] * byy[c] +
              nu * (bxx[r] * byy[c] + byy[r] * bxx[c]) +
              2 * (1 - nu) * bxy[r] * bxy[c]);
    }
  return ke;
}
/**
 * Mesh lines on [0, length]: `base` uniform divisions graded towards both
 * ends (support moments), `sub` divisions across each patch and one graded
 * line a patch width outside it. Lines closer than 0.2 % of the length are
 * merged. Chosen by convergence study against Navier: moments +0.2…+1.1 %,
 * edge shear ±1 %, at about half the cost of ½/1/2-width grading.
 */
export function patchMeshLines(
  length: number,
  base: number,
  patches: [number, number][],
  sub = 4,
) {
  const pts: number[] = [];
  for (let k = 0; k <= base; k++) pts.push((length * k) / base);
  // Support moments are evaluated at the edges: grade the first two elements.
  for (const f of [0.25, 0.5, 1.5]) {
    pts.push((length * f) / base);
    pts.push(length - (length * f) / base);
  }
  for (const [a, b] of patches) {
    const lo = Math.max(0, a),
      hi = Math.min(length, b),
      w = hi - lo;
    for (let k = 0; k <= sub; k++) pts.push(lo + (w * k) / sub);
    if (lo - w > 0) pts.push(lo - w);
    if (hi + w < length) pts.push(hi + w);
  }
  pts.sort((a, b) => a - b);
  const tol = length * 2e-3,
    out = [0];
  for (const v of pts) if (v - out[out.length - 1] > tol) out.push(v);
  out[out.length - 1] = length;
  return out;
}

const cache = new Map<string, PatchSolution>();
/**
 * Solve unit patch loads on a rectangular plate. One factorisation serves all
 * patches. `base` = uniform divisions along the shorter side (16 keeps moments
 * within ~1 % of Navier; see tests).
 */
export function solvePatchLoads(
  lx: number,
  ly: number,
  edges: PatchEdges,
  nu: number,
  patches: PatchRect[],
  base = 16,
): PatchSolution {
  const key = JSON.stringify([lx, ly, edges, nu, patches, base]);
  const hit = cache.get(key);
  if (hit) return hit;
  const short = Math.min(lx, ly),
    divisions = (length: number) =>
      Math.min(64, Math.max(base, Math.round((base * length) / short)));
  const xs = patchMeshLines(
      lx,
      divisions(lx),
      patches.map((p) => [p.x0, p.x1]),
    ),
    ys = patchMeshLines(
      ly,
      divisions(ly),
      patches.map((p) => [p.y0, p.y1]),
    );
  // Number nodes along the direction with fewer lines to minimise bandwidth.
  const xMajor = xs.length <= ys.length,
    nx = xs.length,
    ny = ys.length,
    dof = nx * ny * 4,
    node = (i: number, j: number) => (xMajor ? j * nx + i : i * ny + j) * 4,
    bw = 4 * ((xMajor ? nx : ny) + 2);
  // Upper band storage: K[r * bw + (c − r)], c ≥ r.
  const K = new Float64Array(dof * bw),
    F = patches.map(() => new Float64Array(dof)),
    keCache = new Map<string, Float64Array>();
  const elementDofs = (ei: number, ej: number) => {
    const map: number[] = [];
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      for (let k = 0; k < 4; k++) map.push(node(ei + a, ej + b) + k);
    return map;
  };
  for (let ej = 0; ej < ny - 1; ej++)
    for (let ei = 0; ei < nx - 1; ei++) {
      const hx = xs[ei + 1] - xs[ei],
        hy = ys[ej + 1] - ys[ej],
        sizeKey = `${hx.toPrecision(12)}:${hy.toPrecision(12)}`;
      let ke = keCache.get(sizeKey);
      if (!ke) {
        ke = elementStiffness(hx, hy, nu);
        keCache.set(sizeKey, ke);
      }
      const map = elementDofs(ei, ej);
      for (let r = 0; r < 16; r++)
        for (let c = r; c < 16; c++) {
          const a = map[r],
            b = map[c],
            v = ke[r * 16 + c];
          if (b >= a) K[a * bw + (b - a)] += v;
          else K[b * bw + (a - b)] += v;
        }
      patches.forEach((p, k) => {
        const ax = Math.max(p.x0, xs[ei]),
          bx = Math.min(p.x1, xs[ei + 1]),
          ay = Math.max(p.y0, ys[ej]),
          by = Math.min(p.y1, ys[ej + 1]);
        if (bx - ax <= 1e-12 || by - ay <= 1e-12) return;
        const q = 1 / ((p.x1 - p.x0) * (p.y1 - p.y0));
        for (const [tx, wx] of GAUSS4)
          for (const [ty, wy] of GAUSS4) {
            const n = shape(
                (ax + tx * (bx - ax) - xs[ei]) / hx,
                (ay + ty * (by - ay) - ys[ej]) / hy,
                hx,
                hy,
                0,
                0,
              ),
              w = q * wx * wy * (bx - ax) * (by - ay);
            for (let r = 0; r < 16; r++) F[k][map[r]] += w * n[r];
          }
      });
    }
  // Supports. Pinned edge: w = 0 and tangential slope = 0. Fixed edge: all four nodal DOFs = 0.
  const fixed = new Uint8Array(dof);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const d = node(i, j),
        xEdge = i === 0 ? edges.west : i === nx - 1 ? edges.east : null,
        yEdge = j === 0 ? edges.south : j === ny - 1 ? edges.north : null;
      if (xEdge !== null) {
        fixed[d] = fixed[d + 2] = 1;
        if (xEdge) fixed[d + 1] = fixed[d + 3] = 1;
      }
      if (yEdge !== null) {
        fixed[d] = fixed[d + 1] = 1;
        if (yEdge) fixed[d + 2] = fixed[d + 3] = 1;
      }
    }
  for (let r = 0; r < dof; r++) {
    if (!fixed[r]) continue;
    for (let c = 0; c < bw; c++) K[r * bw + c] = 0;
    for (let c = 1; c < bw && r - c >= 0; c++) K[(r - c) * bw + c] = 0;
    K[r * bw] = 1;
    for (const f of F) f[r] = 0;
  }
  // Banded Cholesky, K = Uᵀ U (U stored in place).
  for (let r = 0; r < dof; r++) {
    for (let k = Math.max(0, r - bw + 1); k < r; k++) {
      const ukr = K[k * bw + (r - k)];
      if (ukr === 0) continue;
      const end = Math.min(dof, k + bw);
      for (let c = r; c < end; c++)
        K[r * bw + (c - r)] -= ukr * K[k * bw + (c - k)];
    }
    const pivot = K[r * bw];
    if (!(pivot > 0))
      throw new Error(
        "Patch-load plate analysis is unstable. Review geometry and supports.",
      );
    const s = Math.sqrt(pivot);
    for (let c = 0; c < bw && r + c < dof; c++) K[r * bw + c] /= s;
  }
  const U = F.map((f) => {
    const y = Float64Array.from(f);
    for (let r = 0; r < dof; r++) {
      for (let k = Math.max(0, r - bw + 1); k < r; k++)
        y[r] -= K[k * bw + (r - k)] * y[k];
      y[r] /= K[r * bw];
    }
    for (let r = dof - 1; r >= 0; r--) {
      for (let c = 1; c < bw && r + c < dof; c++)
        y[r] -= K[r * bw + c] * y[r + c];
      y[r] /= K[r * bw];
    }
    return y;
  });
  const locate = (v: number, lines: number[]) => {
    let lo = 0,
      hi = lines.length - 2;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (lines[m] <= v) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  const at = (k: number, x: number, y: number): PatchFieldValue => {
    const cx = Math.min(Math.max(x, 0), lx),
      cy = Math.min(Math.max(y, 0), ly),
      ei = locate(cx, xs),
      ej = locate(cy, ys),
      hx = xs[ei + 1] - xs[ei],
      hy = ys[ej + 1] - ys[ej],
      sx = (cx - xs[ei]) / hx,
      sy = (cy - ys[ej]) / hy,
      u = U[k];
    // Tensor form: field = Σ X_dx[ix] Y_dy[iy] C[ix][iy], C = element nodal DOFs.
    const X = [0, 1, 2, 3].map((d) => hermite(sx, hx, d)),
      Y = [0, 1, 2, 3].map((d) => hermite(sy, hy, d));
    const T = [0, 0, 0, 0].map(() => [0, 0, 0, 0]); // T[dy][ix] = Σ_iy Y_dy[iy] C[ix][iy]
    for (let ix = 0; ix < 4; ix++)
      for (let iy = 0; iy < 4; iy++) {
        const c =
          u[node(ei + (ix >> 1), ej + (iy >> 1)) + (ix & 1) + 2 * (iy & 1)];
        for (let dy = 0; dy < 4; dy++) T[dy][ix] += Y[dy][iy] * c;
      }
    const ev = (dx: number, dy: number) =>
      X[dx][0] * T[dy][0] +
      X[dx][1] * T[dy][1] +
      X[dx][2] * T[dy][2] +
      X[dx][3] * T[dy][3];
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
  const result = { xs, ys, dof, at };
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
