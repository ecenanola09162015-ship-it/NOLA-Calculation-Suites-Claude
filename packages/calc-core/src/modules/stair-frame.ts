/**
 * Plane-frame direct-stiffness solver for the Stairs module (decision A1).
 *
 * Linear elastic, first-order (ACI 318-19 6.6.1), Euler–Bernoulli members
 * with axial stiffness. Units: m, kN, kN·m.
 *
 * Sign conventions
 * - Global x to the right, y upward. Member local x from node i to node j,
 *   local y = local x rotated +90° (the "upper" face for a member running
 *   up and to the right); the soffit is the −y face.
 * - Section forces: N tension positive; M sagging positive (tension at the
 *   soffit, −y face); V = dM/dx along local x.
 * - Member loads are global vertical loads per horizontal (plan) length,
 *   downward positive (how stair loads are specified, kN/m per m strip).
 */
export interface FrameNode {
  x: number;
  y: number;
}
export interface FrameMember {
  i: number;
  j: number;
  /** Flexural stiffness E·I, kN·m². */
  ei: number;
  /** Axial stiffness E·A, kN. */
  ea: number;
  /** Uniform global vertical load per plan length, kN/m, downward positive. */
  q: number;
}
export interface FrameRestraint {
  node: number;
  ux: boolean;
  uy: boolean;
  rz: boolean;
}
export interface FrameNodalLoad {
  node: number;
  /** Global force, kN (fy downward positive, matching member loads). */
  fx?: number;
  fy?: number;
  /** Moment, kN·m, counter-clockwise positive. */
  mz?: number;
}
export interface FrameModel {
  nodes: FrameNode[];
  members: FrameMember[];
  restraints: FrameRestraint[];
  nodalLoads?: FrameNodalLoad[];
}
export interface MemberSection {
  /** Axial force, kN (tension +). */
  n: number;
  /** Shear, kN (dM/dx along local x). */
  v: number;
  /** Bending moment, kN·m (sagging +). */
  m: number;
}
export interface FrameMemberResult {
  start: MemberSection;
  end: MemberSection;
  /** Moment at mid-length, kN·m (sagging +). */
  mid: number;
  /** Local transverse / axial load per member length, kN/m. */
  py: number;
  px: number;
  length: number;
}
export interface FrameReaction {
  node: number;
  /** Global reactions on the structure, kN (ry upward positive), kN·m CCW. */
  rx: number;
  ry: number;
  mz: number;
}
export interface FrameResult {
  /** Nodal displacements: ux, uy (m, global, uy upward +), rz (rad). */
  displacements: { ux: number; uy: number; rz: number }[];
  members: FrameMemberResult[];
  reactions: FrameReaction[];
}

export class FrameInstabilityError extends Error {
  constructor(
    message = "Unstable support layout: the frame can move as a rigid body.",
  ) {
    super(message);
    this.name = "FrameInstabilityError";
  }
}

function geometry(m: FrameMember, nodes: FrameNode[]) {
  const a = nodes[m.i],
    b = nodes[m.j];
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = Math.hypot(dx, dy);
  if (!(l > 1e-9)) throw new Error("Zero-length frame member.");
  return { c: dx / l, s: dy / l, l };
}

function localStiffness(ea: number, ei: number, l: number): number[][] {
  const a = ea / l,
    k1 = (12 * ei) / l ** 3,
    k2 = (6 * ei) / l ** 2,
    k3 = (4 * ei) / l,
    k4 = (2 * ei) / l;
  return [
    [a, 0, 0, -a, 0, 0],
    [0, k1, k2, 0, -k1, k2],
    [0, k2, k3, 0, -k2, k4],
    [-a, 0, 0, a, 0, 0],
    [0, -k1, -k2, 0, k1, -k2],
    [0, k2, k4, 0, -k2, k3],
  ];
}

/** Local distributed loads (per member length) from a global vertical q per plan length. */
function localLoads(q: number, c: number, s: number) {
  const w = q * Math.abs(c); // downward force per member length
  // global load vector (0, −w) projected on local x (c, s) and local y (−s, c)
  return { px: -w * s, py: -w * c };
}

/** Fixed-end forces (support reactions on a fixed–fixed member), local. */
function fixedEnd(px: number, py: number, l: number): number[] {
  return [
    (-px * l) / 2,
    (-py * l) / 2,
    (-py * l * l) / 12,
    (-px * l) / 2,
    (-py * l) / 2,
    (py * l * l) / 12,
  ];
}

function toGlobal(c: number, s: number, v: number[]): number[] {
  return [
    c * v[0] - s * v[1],
    s * v[0] + c * v[1],
    v[2],
    c * v[3] - s * v[4],
    s * v[3] + c * v[4],
    v[5],
  ];
}
function toLocal(c: number, s: number, v: number[]): number[] {
  return [
    c * v[0] + s * v[1],
    -s * v[0] + c * v[1],
    v[2],
    c * v[3] + s * v[4],
    -s * v[3] + c * v[4],
    v[5],
  ];
}

/** Solve K u = F for several right-hand sides (Gaussian elimination, partial pivoting). */
function solveDense(k: number[][], rhs: number[][]): number[][] {
  const n = k.length;
  const a = k.map((r) => r.slice());
  const b = rhs.map((r) => r.slice());
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(a[i][i]));
  const tol = Math.max(scale, 1) * 1e-10;
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(a[r][col]) > Math.abs(a[p][col])) p = r;
    if (Math.abs(a[p][col]) < tol) throw new FrameInstabilityError();
    if (p !== col) {
      [a[p], a[col]] = [a[col], a[p]];
      for (const v of b) [v[p], v[col]] = [v[col], v[p]];
    }
    const piv = a[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / piv;
      if (f === 0) continue;
      const ar = a[r],
        ac = a[col];
      for (let cc = col; cc < n; cc++) ar[cc] -= f * ac[cc];
      for (const v of b) v[r] -= f * v[col];
    }
  }
  return b.map((v) => {
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let sum = v[r];
      for (let cc = r + 1; cc < n; cc++) sum -= a[r][cc] * x[cc];
      x[r] = sum / a[r][r];
    }
    return x;
  });
}

/**
 * Solve one or more load cases on the same frame. `cases[k]` gives the
 * member loads q (per member, kN/m plan) and nodal loads for case k;
 * `model.members[].q` and `model.nodalLoads` are used when `cases` is omitted.
 */
export function solveFrame(
  model: FrameModel,
  cases?: { q: number[]; nodalLoads?: FrameNodalLoad[] }[],
): FrameResult[] {
  const { nodes, members, restraints } = model;
  const nd = nodes.length * 3;
  const lc = cases ?? [
    { q: members.map((m) => m.q), nodalLoads: model.nodalLoads ?? [] },
  ];
  const fixed = new Array<boolean>(nd).fill(false);
  for (const r of restraints) {
    if (r.ux) fixed[r.node * 3] = true;
    if (r.uy) fixed[r.node * 3 + 1] = true;
    if (r.rz) fixed[r.node * 3 + 2] = true;
  }
  const free: number[] = [];
  const map = new Array<number>(nd).fill(-1);
  for (let d = 0; d < nd; d++)
    if (!fixed[d]) {
      map[d] = free.length;
      free.push(d);
    }
  const geo = members.map((m) => geometry(m, nodes));
  const kLoc = members.map((m, e) => localStiffness(m.ea, m.ei, geo[e].l));
  const kff = Array.from({ length: free.length }, () =>
    new Array<number>(free.length).fill(0),
  );
  const loads = lc.map(() => new Array<number>(nd).fill(0));
  const fefs = lc.map(() => [] as number[][]);
  members.forEach((m, e) => {
    const { c, s, l } = geo[e];
    const t = [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    const kl = kLoc[e];
    // kg = Tᵀ kl T
    const kt = kl.map((row) =>
      t[0].map((_, j) => row.reduce((acc, v, k) => acc + v * t[k][j], 0)),
    );
    const kg = t[0].map((_, i) =>
      t[0].map((_, j) => t.reduce((acc, row, k) => acc + row[i] * kt[k][j], 0)),
    );
    const dofs = [
      m.i * 3,
      m.i * 3 + 1,
      m.i * 3 + 2,
      m.j * 3,
      m.j * 3 + 1,
      m.j * 3 + 2,
    ];
    for (let a = 0; a < 6; a++) {
      const ra = map[dofs[a]];
      if (ra < 0) continue;
      for (let b = 0; b < 6; b++) {
        const cb = map[dofs[b]];
        if (cb >= 0) kff[ra][cb] += kg[a][b];
      }
    }
    lc.forEach((cs, k) => {
      const { px, py } = localLoads(cs.q[e] ?? 0, c, s);
      const fef = fixedEnd(px, py, l);
      fefs[k][e] = fef;
      const g = toGlobal(c, s, fef);
      for (let a = 0; a < 6; a++) loads[k][dofs[a]] -= g[a];
    });
  });
  lc.forEach((cs, k) => {
    for (const p of cs.nodalLoads ?? []) {
      loads[k][p.node * 3] += p.fx ?? 0;
      loads[k][p.node * 3 + 1] -= p.fy ?? 0;
      loads[k][p.node * 3 + 2] += p.mz ?? 0;
    }
  });
  if (!free.length)
    throw new FrameInstabilityError("No free degrees of freedom.");
  const sol = solveDense(
    kff,
    loads.map((f) => free.map((d) => f[d])),
  );
  return lc.map((cs, k) => {
    const u = new Array<number>(nd).fill(0);
    free.forEach((d, idx) => (u[d] = sol[k][idx]));
    const nodalReaction = new Array<number>(nd).fill(0);
    const memberResults = members.map((m, e) => {
      const { c, s, l } = geo[e];
      const dofs = [
        m.i * 3,
        m.i * 3 + 1,
        m.i * 3 + 2,
        m.j * 3,
        m.j * 3 + 1,
        m.j * 3 + 2,
      ];
      const dl = toLocal(
        c,
        s,
        dofs.map((d) => u[d]),
      );
      const fef = fefs[k][e];
      const f = kLoc[e].map(
        (row, a) => row.reduce((acc, v, b) => acc + v * dl[b], 0) + fef[a],
      );
      const g = toGlobal(c, s, f);
      dofs.forEach((d, a) => (nodalReaction[d] += g[a]));
      const { px, py } = localLoads(cs.q[e] ?? 0, c, s);
      const m0 = -f[2],
        v0 = f[1];
      return {
        start: { n: -f[0], v: v0, m: m0 },
        end: { n: f[3], v: -f[4], m: f[5] },
        mid: m0 + (v0 * l) / 2 + (py * l * l) / 8,
        px,
        py,
        length: l,
      };
    });
    // Reactions = assembled member end forces minus applied nodal loads at restrained dofs.
    for (const p of cs.nodalLoads ?? []) {
      nodalReaction[p.node * 3] -= p.fx ?? 0;
      nodalReaction[p.node * 3 + 1] += p.fy ?? 0;
      nodalReaction[p.node * 3 + 2] -= p.mz ?? 0;
    }
    const reactions = restraints.map((r) => ({
      node: r.node,
      rx: r.ux ? nodalReaction[r.node * 3] : 0,
      ry: r.uy ? nodalReaction[r.node * 3 + 1] : 0,
      mz: r.rz ? nodalReaction[r.node * 3 + 2] : 0,
    }));
    return {
      displacements: nodes.map((_, n) => ({
        ux: u[n * 3],
        uy: u[n * 3 + 1],
        rz: u[n * 3 + 2],
      })),
      members: memberResults,
      reactions,
    };
  });
}
