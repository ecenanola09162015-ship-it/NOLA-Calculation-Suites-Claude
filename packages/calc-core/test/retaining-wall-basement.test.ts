/**
 * Multi-level basement walls: continuous-beam closed forms for the stem
 * solver with intermediate slabs, storey bookkeeping, layered earth pressure
 * by hand, and the stage before the top slab is cast.
 */
import { describe, expect, it } from "vitest";

import {
  atRestK0,
  basementStoreys,
  defaultRetainingWallInput,
  designRetainingWall,
  earthCoefficients,
  pressureComponents,
  retainingWallInputSchema,
  solveStem,
} from "../src";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const ei = () => 1e5;

describe("Stem with intermediate slabs (continuous beam)", () => {
  it("two equal pinned spans, uniform w: middle reaction 1.25wl, support moment wl²/8", () => {
    const w = 10,
      l = 3;
    const s = solveStem(2 * l, ei, { base: "pinned", top: "pinned", prop: null, intermediate: [l] }, { p: () => w, breaks: [] }, 60);
    expect(rel(s.intermediate[0]!, 1.25 * w * l)).toBeLessThan(1e-6);
    expect(rel(s.topForce!, 0.375 * w * l)).toBeLessThan(1e-6);
    expect(rel(s.moment(l), (w * l * l) / 8)).toBeLessThan(1e-6);
  });
  it("three equal pinned spans: interior reactions 1.1wl, support moments 0.1wl²", () => {
    const w = 10,
      l = 3;
    const s = solveStem(3 * l, ei, { base: "pinned", top: "pinned", prop: null, intermediate: [2 * l, l] }, { p: () => w, breaks: [] }, 90);
    for (const r of s.intermediate) expect(rel(r, 1.1 * w * l)).toBeLessThan(1e-6);
    expect(rel(s.moment(l), 0.1 * w * l * l)).toBeLessThan(1e-6);
    expect(rel(s.moment(2 * l), 0.1 * w * l * l)).toBeLessThan(1e-6);
    // Equilibrium.
    const sum = s.intermediate.reduce((a, b) => a + b, 0) + s.topForce! + s.baseShear;
    expect(rel(sum, 3 * w * l)).toBeLessThan(1e-9 + 1e-6);
  });
});

const base = defaultRetainingWallInput();
const wall = (over: Record<string, unknown> = {}) =>
  retainingWallInputSchema.parse({
    ...base,
    wallType: "basement",
    height: 9,
    stemTop: 0.3,
    stemBase: 0.3,
    footing: 0.5,
    soil: { ...base.soil, theory: "at-rest" },
    basement: { top: "pinned", base: "fixed", levels: [{ height: 3, slab: 0.2 }, { height: 3, slab: 0.2 }, { height: 3, slab: 0.25 }], stage: false },
    ...over,
  });

describe("Basement storeys", () => {
  it("resolve intermediate slab levels from the top storey down", () => {
    const st = basementStoreys(wall());
    expect(st.intermediate).toEqual([6, 3]);
    expect(st.storeys.map((s) => s.name)).toEqual(["B1", "B2", "B3"]);
  });
  it("reject storey heights that do not add up to the wall height", () => {
    expect(() => wall({ height: 8 })).toThrow();
  });
  it("report span and support moments and slab reactions per storey", () => {
    const r = designRetainingWall(wall());
    expect(r.storeys).toHaveLength(3);
    const levels = r.stem.reactions.at(-1)!.levels;
    expect(levels).toHaveLength(2);
    // Lower slabs carry more than the slab above (pressure grows with depth).
    expect(r.storeys[2]!.slabReaction).toBeGreaterThan(r.storeys[1]!.slabReaction);
    expect(r.storeys[1]!.bottomMoment).toBeGreaterThan(0);
    expect(r.plate).toBeNull();
  });
  it("add the stage check before the top slab is cast", () => {
    const r = designRetainingWall(wall({ basement: { ...wall().basement, stage: true } }));
    expect(r.stage).not.toBeNull();
    expect(r.checks.some((c) => c.id === "stage:flex")).toBe(true);
  });
  it("carry the slab lines into the full-width plate", () => {
    const r = designRetainingWall(wall({ analysis: "plate", plate: { ...base.plate, length: 12 } }));
    expect(r.plate!.supports.horizontal).toEqual([6, 3]);
  });
});

describe("Layered earth pressure", () => {
  it("accumulates σ′v layer by layer with K per layer (at rest, water at depth 5 m)", () => {
    const i = wall({
      soil: { ...base.soil, theory: "at-rest", layers: [{ thickness: 3, gamma: 18, gammaSat: 20, phi: 28 }, { thickness: 10, gamma: 19, gammaSat: 21, phi: 34 }] },
      water: { ...base.water, enabled: true, back: 4.5 },
    });
    const c = earthCoefficients(i);
    // Stem plane: height 9 m, water 4.5 − 0.5 = 4 m above the base → z_w = 5 m.
    const soil = pressureComponents(i, c, { height: 9, water: 4 }).find((p) => p.id === "soil")!;
    const k1 = atRestK0(28),
      k2 = atRestK0(34);
    expect(soil.p(2)).toBeCloseTo(k1 * 18 * 2, 9);
    expect(soil.p(4)).toBeCloseTo(k2 * (18 * 3 + 19 * 1), 9);
    expect(soil.p(7)).toBeCloseTo(k2 * (18 * 3 + 19 * 2 + (21 - 9.81) * 2), 6);
  });
});
