import { describe, expect, it } from "vitest";
import { solvePatchLoads } from "../src/modules/slab-patch-fe";

/**
 * Navier double series, simply supported a × b plate (a = 1), total load P = 1
 * uniformly spread over u × v centred at (ξ, η); D = 1.
 * Timoshenko & Woinowsky-Krieger, Theory of Plates and Shells, Art. 30.
 */
function navier(
  b: number,
  xi: number,
  eta: number,
  u: number,
  v: number,
  x: number,
  y: number,
  nu: number,
  terms = 400,
) {
  let w = 0,
    mx = 0,
    my = 0,
    qx = 0;
  const q0 = 1 / (u * v),
    pi = Math.PI;
  for (let m = 1; m <= terms; m++)
    for (let n = 1; n <= terms; n++) {
      const qmn =
        ((16 * q0) / (pi * pi * m * n)) *
        Math.sin(m * pi * xi) *
        Math.sin((n * pi * eta) / b) *
        Math.sin((m * pi * u) / 2) *
        Math.sin((n * pi * v) / (2 * b));
      if (qmn === 0) continue;
      const k = m * m + (n * n) / (b * b),
        W = qmn / (pi ** 4 * k * k),
        sx = Math.sin(m * pi * x),
        sy = Math.sin((n * pi * y) / b);
      w += W * sx * sy;
      mx += W * pi * pi * (m * m + (nu * n * n) / (b * b)) * sx * sy;
      my += W * pi * pi * ((n * n) / (b * b) + nu * m * m) * sx * sy;
      qx += W * pi ** 3 * m * k * Math.cos(m * pi * x) * sy;
    }
  return { w, mx, my, qx };
}
const ss = { west: false, east: false, south: false, north: false };
const clamped = { west: true, east: true, south: true, north: true };

describe("patch-load plate FE (BFS 16-DOF) vs closed-form solutions", () => {
  const cases = [
    { b: 1, xi: 0.5, eta: 0.5, u: 0.2, v: 0.2 },
    { b: 1, xi: 0.5, eta: 0.5, u: 0.04, v: 0.04 },
    { b: 1.5, xi: 0.3, eta: 0.5, u: 0.1, v: 0.15 },
    { b: 2.5, xi: 0.5, eta: 1.0, u: 0.1, v: 0.1 },
    { b: 1.2, xi: 0.12, eta: 0.2, u: 0.08, v: 0.06 },
  ];
  for (const c of cases)
    it(`SS ${c.b}:1 plate, ${c.u}×${c.v} patch at (${c.xi}, ${c.eta}): w, Mx, My under the load`, () => {
      const fe = solvePatchLoads(1, c.b, ss, 0.2, [
        {
          x0: c.xi - c.u / 2,
          x1: c.xi + c.u / 2,
          y0: c.eta - c.v / 2,
          y1: c.eta + c.v / 2,
        },
      ]);
      const exact = navier(c.b, c.xi, c.eta, c.u, c.v, c.xi, c.eta, 0.2),
        p = fe.at(0, c.xi, c.eta);
      expect(p.w / exact.w).toBeCloseTo(1, 3);
      // Moments converge from above (conservative) within ~1.1 %.
      for (const [a, e] of [
        [p.mx, exact.mx],
        [p.my, exact.my],
      ]) {
        expect(a / e).toBeGreaterThan(0.995);
        expect(a / e).toBeLessThan(1.015);
      }
      // Edge shear at 0.05a from the support within 3 %.
      const q = navier(c.b, c.xi, c.eta, c.u, c.v, 0.05, c.eta, 0.2).qx;
      expect(Math.abs(fe.at(0, 0.05, c.eta).qx / q - 1)).toBeLessThan(0.03);
    });
  it("shear at the support line within ±5 % (patch near the edge)", () => {
    for (const [xi, u, v] of [
      [0.15, 0.2, 0.2],
      [0.3, 0.2, 0.15],
    ]) {
      const fe = solvePatchLoads(1, 1, ss, 0.2, [
        { x0: xi - u / 2, x1: xi + u / 2, y0: 0.5 - v / 2, y1: 0.5 + v / 2 },
      ]);
      const q = navier(1, xi, 0.5, u, v, 0, 0.5, 0.2, 600).qx;
      expect(Math.abs(fe.at(0, 0, 0.5).qx / q - 1)).toBeLessThan(0.05);
    }
  });
  it("clamped square, central load: T&WK w = 0.00560 Pa²/D, mid-edge M = −0.1257 P (ν = 0.3)", () => {
    const fe = solvePatchLoads(1, 1, clamped, 0.3, [
      { x0: 0.495, x1: 0.505, y0: 0.495, y1: 0.505 },
    ]);
    expect(fe.at(0, 0.5, 0.5).w).toBeCloseTo(0.0056, 4);
    expect(fe.at(0, 0, 0.5).mx / -0.1257).toBeCloseTo(1, 2);
  });
  it("is invariant to transposing the panel and scales with span", () => {
    const a = solvePatchLoads(4, 6, ss, 0.2, [
        { x0: 1.0, x1: 1.4, y0: 2.0, y1: 2.6 },
      ]).at(0, 1.2, 2.3),
      b = solvePatchLoads(6, 4, ss, 0.2, [
        { x0: 2.0, x1: 2.6, y0: 1.0, y1: 1.4 },
      ]).at(0, 2.3, 1.2);
    expect(a.mx).toBeCloseTo(b.my, 9);
    expect(a.my).toBeCloseTo(b.mx, 9);
    expect(a.w).toBeCloseTo(b.w, 9);
    // Same geometry ×2: moments per unit load unchanged, w ×4 (w ∝ P L²/D).
    const s1 = solvePatchLoads(2, 3, ss, 0.2, [
        { x0: 0.5, x1: 0.7, y0: 1.0, y1: 1.3 },
      ]).at(0, 0.6, 1.15),
      s2 = solvePatchLoads(4, 6, ss, 0.2, [
        { x0: 1.0, x1: 1.4, y0: 2.0, y1: 2.6 },
      ]).at(0, 1.2, 2.3);
    expect(s2.mx).toBeCloseTo(s1.mx, 6);
    expect(s2.w / s1.w).toBeCloseTo(4, 6);
  });
});
