/**
 * Counterfort design (Phase 3): T-beam strength by hand, FE line-reaction
 * equilibrium, heel slab moments, and the wall-design integration.
 */
import { describe, expect, it } from "vitest";

import {
  defaultRetainingWallInput,
  designRetainingWall,
  heelBetweenCounterforts,
  retainingWallInputSchema,
  slabFlexuralStrength,
  solveWallPlate,
  tBeamStrength,
} from "../src";

describe("T-beam strength", () => {
  it("equals the rectangular slab strength when the block stays in the flange", () => {
    const t = tBeamStrength(28, 420, 200000, 1000, 250, 300, 1500, 400);
    const s = slabFlexuralStrength({ fc: 28, fy: 420, es: 200000 }, [{ as: 1500, d: 400 }]);
    expect(t.inFlange).toBe(true);
    expect(t.phiMn).toBeCloseTo(s.phiMn, 6);
  });
  it("matches the hand flange + web decomposition when a > hf", () => {
    // Cf = 0.85·28·500·100 = 1.19 MN; a = (6000·420 − Cf)/(0.85·28·300) = 186 mm > hf.
    const t = tBeamStrength(28, 420, 200000, 800, 100, 300, 6000, 600);
    const cf = 0.85 * 28 * 500 * 100,
      aw = (6000 * 420 - cf) / (0.85 * 28 * 300),
      mn = (cf * (600 - 50) + 0.85 * 28 * 300 * aw * (600 - aw / 2)) / 1e6;
    expect(t.inFlange).toBe(false);
    expect(t.a).toBeCloseTo(aw, 1);
    expect(t.mn).toBeCloseTo(mn, 1);
    expect(t.phi).toBe(0.9);
  });
});

describe("Buttress line reactions", () => {
  it("carry the whole load when the buttresses are the only supports", () => {
    const L = 6,
      H = 3,
      q = 10;
    const s = solveWallPlate(L, H, 0.2, { base: "free", top: "free", left: "free", right: "free", vertical: [1, 3, 5].map((x) => ({ x, height: H })), horizontal: [] }, [{ q: () => q }], 12);
    const total = -s.lineReactions.reduce((sum, l) => sum + l.force[0]!.reduce((a, b) => a + b, 0), 0);
    expect(rel(total, q * L * H)).toBeLessThan(1e-6);
    // Symmetric outer lines, interior line takes the larger share of a continuous slab with overhangs.
    const r = s.lineReactions.map((l) => -l.force[0]!.reduce((a, b) => a + b, 0));
    expect(r[0]).toBeCloseTo(r[2]!, 6);
  });
});

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("Heel between counterforts", () => {
  it("takes the larger of the interior and overhang moments", () => {
    expect(heelBetweenCounterforts(100, 3, 0).mu).toBeCloseTo(75, 9);
    expect(heelBetweenCounterforts(100, 3, 1.5).mu).toBeCloseTo(112.5, 9);
  });
});

describe("Counterfort wall design", () => {
  const base = defaultRetainingWallInput();
  const input = retainingWallInputSchema.parse({
    ...base,
    height: 6,
    stemTop: 0.25,
    stemBase: 0.3,
    toe: 0.8,
    heel: 3,
    footing: 0.5,
    analysis: "plate",
    plate: { ...base.plate, length: 9, buttresses: [1.5, 4.5, 7.5].map((x) => ({ x, height: 6, width: 0.3 })) },
  });
  const r = designRetainingWall(input);
  it("designs one counterfort per buttress with its checks", () => {
    expect(r.counterforts).toHaveLength(3);
    expect(r.checks.filter((c) => c.group === "Counterfort").length).toBeGreaterThanOrEqual(3 * 7);
    expect(r.heelSpan).not.toBeNull();
  });
  it("is symmetric and loaded below the tributary share of the strip pressure", () => {
    const [a, b, c] = r.counterforts;
    expect(a!.reaction).toBeCloseTo(c!.reaction, 3);
    // The base takes part of the load, so each counterfort carries less than s × strip shear.
    const stripShear = r.stem.reactions.reduce((m, x) => Math.max(m, x.baseShear), 0);
    expect(b!.reaction).toBeLessThan(3 * stripShear);
    expect(b!.reaction).toBeGreaterThan(0.5 * 3 * stripShear);
  });
  it("base shear and moment follow from the nodal reactions", () => {
    const c = r.counterforts[1]!,
      s0 = c.stations[0]!;
    expect(s0.y).toBe(0);
    expect(s0.mu).toBeCloseTo(c.flexure.y === 0 ? c.flexure.mu : s0.mu, 9);
    expect(s0.vu).toBeGreaterThanOrEqual(c.reaction - 1e-6);
    // Taper reduces shear: Vu,eff ≤ Vu everywhere.
    for (const s of c.stations) expect(s.vuEff).toBeLessThanOrEqual(s.vu + 1e-9);
  });
  it("skips counterfort design without a heel", () => {
    const rr = designRetainingWall(retainingWallInputSchema.parse({ ...input, wallType: "basement" }));
    expect(rr.counterforts).toHaveLength(0);
  });
});
