/**
 * Wall plate FE benchmarks (Phase 2). Closed forms and independently summed
 * series; tolerances stated per test.
 */
import { describe, expect, it } from "vitest";

import { solveWallPlate, woodArmer, type WallPlateSupports } from "../src";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const ss: WallPlateSupports = { base: "pinned", top: "pinned", left: "pinned", right: "pinned", vertical: [], horizontal: [] };

/** Navier series for a simply supported a × b plate under q(x, y) (numerical load coefficients), D = 1. */
function navier(a: number, b: number, q: (x: number, y: number) => number, x: number, y: number, nu: number, terms = 60) {
  const pi = Math.PI,
    N = 120;
  // q_mn = 4/(ab) ∫∫ q sin(mπx/a) sin(nπy/b): q here is separable into f(y), uniform in x.
  let mx = 0,
    my = 0,
    w = 0;
  for (let m = 1; m <= terms; m += 2) {
    const cx = (2 / (m * pi)) * 2; // ∫0^a sin(mπx/a) dx · (2/a) for odd m = 4/(mπ)
    for (let n = 1; n <= terms; n++) {
      let iy = 0;
      for (let k = 0; k < N; k++) {
        const yy = ((k + 0.5) * b) / N;
        iy += q(0, yy) * Math.sin((n * pi * yy) / b) * (b / N);
      }
      const qmn = cx * (2 / b) * iy;
      const k2 = (m / a) ** 2 + (n / b) ** 2,
        W = qmn / (pi ** 4 * k2 * k2),
        sx = Math.sin((m * pi * x) / a),
        sy = Math.sin((n * pi * y) / b);
      w += W * sx * sy;
      mx += W * pi * pi * ((m / a) ** 2 + nu * (n / b) ** 2) * sx * sy;
      my += W * pi * pi * ((n / b) ** 2 + nu * (m / a) ** 2) * sx * sy;
    }
  }
  return { w, mx, my };
}

describe("wall plate FE vs closed forms", () => {
  it("simply supported square, uniform: Navier centre moment within 1 %", () => {
    const s = solveWallPlate(1, 1, 0.3, ss, [{ q: () => 1 }]);
    const n = navier(1, 1, () => 1, 0.5, 0.5, 0.3);
    expect(rel(s.at(0, 0.5, 0.5).mx, n.mx)).toBeLessThan(0.01);
    expect(rel(s.at(0, 0.5, 0.5).w, n.w)).toBeLessThan(0.005);
    // Timoshenko Table 8: 0.0479 qa², w = 0.00406 qa⁴/D (ν = 0.3).
    expect(rel(s.at(0, 0.5, 0.5).mx, 0.0479)).toBeLessThan(0.01);
  });
  it("simply supported 2 × 1 plate under hydrostatic load: Navier within 1 %", () => {
    const q = (_x: number, y: number) => 10 * (1 - y / 1);
    const s = solveWallPlate(2, 1, 0.2, ss, [{ q }]);
    for (const [x, y] of [
      [1, 0.4],
      [1, 0.5],
      [0.5, 0.3],
    ] as const) {
      const n = navier(2, 1, q, x, y, 0.2);
      expect(rel(s.at(0, x, y).my, n.my)).toBeLessThan(0.01);
      expect(rel(s.at(0, x, y).mx, n.mx)).toBeLessThan(0.015);
    }
  });
  it("clamped square, uniform: centre 0.0231 qa², edge −0.0513 qa² (Timoshenko, ν = 0.3)", () => {
    const s = solveWallPlate(1, 1, 0.3, { ...ss, base: "fixed", top: "fixed", left: "fixed", right: "fixed" }, [{ q: () => 1 }]);
    expect(rel(s.at(0, 0.5, 0.5).mx, 0.0231)).toBeLessThan(0.015);
    expect(rel(s.at(0, 0.5, 0).my, -0.0513)).toBeLessThan(0.015);
  });
  it("long cantilever wall (L/H = 10, free ends): mid-length base moment = PH/3 within 1 %", () => {
    const H = 3,
      w = 18,
      P = (w * H) / 2;
    const s = solveWallPlate(30, H, 0.2, { base: "fixed", top: "free", left: "free", right: "free", vertical: [], horizontal: [] }, [
      { q: (_x, y) => (w * (H - y)) / H },
    ]);
    expect(rel(-s.at(0, 15, 0).my, (P * H) / 3)).toBeLessThan(0.01);
    // Cylindrical bending: mx = ν my away from the ends.
    expect(rel(s.at(0, 15, 0).mx, 0.2 * s.at(0, 15, 0).my)).toBeLessThan(0.02);
  });
  it("long propped wall (top pinned): base moment = 2PH/15 within 1 %; prop as a line support gives the same", () => {
    const H = 4,
      w = 24,
      P = (w * H) / 2;
    const load = [{ q: (_x: number, y: number) => (w * (H - y)) / H }];
    const top = solveWallPlate(32, H, 0.2, { base: "fixed", top: "pinned", left: "free", right: "free", vertical: [], horizontal: [] }, load);
    expect(rel(-top.at(0, 16, 0).my, (2 * P * H) / 15)).toBeLessThan(0.01);
    const line = solveWallPlate(32, H, 0.2, { base: "fixed", top: "free", left: "free", right: "free", vertical: [], horizontal: [H * 0.999] }, load);
    expect(rel(-line.at(0, 16, 0).my, (2 * P * H) / 15)).toBeLessThan(0.02);
  });
  it("closely spaced full-height buttresses: horizontal spanning, mx at a buttress ≈ −q s²/12 within 3 %", () => {
    const s0 = 1,
      L = 8,
      H = 6,
      q = 10;
    const vertical = Array.from({ length: 7 }, (_, k) => ({ x: (k + 1) * s0, height: H }));
    const sol = solveWallPlate(L, H, 0.2, { base: "pinned", top: "free", left: "fixed", right: "fixed", vertical, horizontal: [] }, [{ q: () => q }]);
    expect(rel(sol.at(0, 4, H / 2).mx, (-q * s0 * s0) / 12)).toBeLessThan(0.03);
    expect(rel(sol.at(0, 4.5, H / 2).mx, (q * s0 * s0) / 24)).toBeLessThan(0.04);
  });
  it("partial-height buttress supports only below its top", () => {
    const sol = solveWallPlate(6, 3, 0.2, { base: "fixed", top: "free", left: "free", right: "free", vertical: [{ x: 3, height: 1.5 }], horizontal: [] }, [
      { q: () => 10 },
    ]);
    expect(Math.abs(sol.at(0, 3, 1.0).w)).toBeLessThan(1e-12);
    expect(sol.at(0, 3, 2.5).w).toBeGreaterThan(0);
  });
});

describe("Wood–Armer", () => {
  it("adds |mxy| and applies the negative-moment correction", () => {
    expect(woodArmer(10, 5, 2)).toMatchObject({ frontX: 12, frontY: 7 });
    // mx + |mxy| < 0 → Mx* = 0, My* = my + mxy²/|mx|.
    const r = woodArmer(-5, 8, 2);
    expect(r.frontX).toBe(0);
    expect(r.frontY).toBeCloseTo(8 + 4 / 5, 9);
    expect(woodArmer(-10, -5, 2)).toMatchObject({ backX: 12, backY: 7, frontX: 0, frontY: 0 });
  });
});

import { defaultRetainingWallInput, designRetainingWall, retainingWallInputSchema } from "../src";
describe("full-width wall design (Phase 2)", () => {
  const wall = (patch: (i: ReturnType<typeof defaultRetainingWallInput>) => void) => {
    const i = defaultRetainingWallInput();
    i.analysis = "plate";
    patch(i);
    return retainingWallInputSchema.parse(i);
  };
  const strip = designRetainingWall(defaultRetainingWallInput());
  const stripMu = strip.flexure.find((f) => f.id === "stem-back")!.mu;
  it("long free-ended wall: plate base moment = strip Mu (87.8) to +7 % (free-corner concentration)", () => {
    const r = designRetainingWall(wall((i) => (i.plate.length = 30)));
    const pk = r.plate!.peaks.find((p) => p.id === "backY")!;
    expect(pk.y).toBeLessThan(0.05);
    expect(pk.demand / stripMu).toBeGreaterThan(0.99);
    expect(pk.demand / stripMu).toBeLessThan(1.07);
    expect(r.flexure.some((f) => f.id === "stem-back")).toBe(false);
    expect(r.checks.some((c) => c.id === "fl:plate-backY" && c.group === "Stem")).toBe(true);
    // Mid-length value equals the strip.
    expect(Math.abs(r.plate!.field("backY", 15, 0) / stripMu - 1)).toBeLessThan(0.01);
  });
  it("short wall between fixed end walls: lower vertical moment, horizontal hogging at the ends", () => {
    const r = designRetainingWall(wall((i) => {
      i.plate.length = 4;
      i.plate.left = "fixed";
      i.plate.right = "fixed";
    }));
    const v = r.plate!.peaks.find((p) => p.id === "backY")!,
      h = r.plate!.peaks.find((p) => p.id === "backX")!;
    expect(v.demand).toBeLessThan(0.8 * stripMu);
    expect(h.demand).toBeGreaterThan(5);
    expect(Math.min(h.x, 4 - h.x)).toBeLessThan(0.05);
    expect(r.checks.some((c) => c.id === "sh:plate-shearX")).toBe(true);
  });
  it("buttresses at 2 m reduce the vertical base moment", () => {
    const r = designRetainingWall(wall((i) => {
      i.plate.length = 10;
      i.plate.buttresses = [2, 4, 6, 8].map((x) => ({ x, height: 3.8, width: 0.3 }));
    }));
    expect(r.plate!.peaks.find((p) => p.id === "backY")!.demand).toBeLessThan(0.6 * stripMu);
  });
  it("1 m averaging never exceeds the peak", () => {
    const peak = designRetainingWall(wall((i) => (i.plate.length = 4, i.plate.left = "fixed", i.plate.right = "fixed")));
    const av = designRetainingWall(wall((i) => (i.plate.length = 4, i.plate.left = "fixed", i.plate.right = "fixed", i.plate.averaging = "1m")));
    for (const id of ["backY", "backX"] as const)
      expect(av.plate!.peaks.find((p) => p.id === id)!.demand).toBeLessThanOrEqual(peak.plate!.peaks.find((p) => p.id === id)!.demand + 1e-9);
  });
});
