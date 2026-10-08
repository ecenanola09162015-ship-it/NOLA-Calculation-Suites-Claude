import { describe, expect, it } from "vitest";
import {
  analyzeSlab,
  defaultSlabInput,
  parseSlabLoads,
  resolveSlabBars,
  slabDraftSchema,
  slabFlexuralStrength,
} from "../src/modules/slab-design";
import { solveSlabPlate } from "../src/modules/slab-plate";
const pinned = {
  west: "Pinned",
  east: "Pinned",
  south: "Pinned",
  north: "Pinned",
} as const;
function navier(r: number, nu: number) {
  let mx = 0,
    my = 0,
    w = 0;
  for (let m = 1; m < 80; m += 2)
    for (let n = 1; n < 80; n += 2) {
      const sign = Math.sin((m * Math.PI) / 2) * Math.sin((n * Math.PI) / 2),
        a = m ** 2,
        b = n ** 2 / r ** 2;
      const amplitude = (16 / (Math.PI ** 6 * m * n * (a + b) ** 2)) * sign;
      w += amplitude;
      mx += Math.PI ** 2 * (a + nu * b) * amplitude;
      my += Math.PI ** 2 * (b + nu * a) * amplitude;
    }
  return { mx, my, w };
}
describe("slab independent analysis benchmarks", () => {
  it.each([1, 1.4, 1.9])(
    "matches an independently summed Navier simply-supported plate at aspect %s",
    (r) => {
      const p = solveSlabPlate(
          r,
          { west: false, east: false, south: false, north: false },
          0.2,
        ),
        n = navier(r, 0.2);
      const center = p.at(0.5, r / 2);
      expect(center.mx / n.mx).toBeCloseTo(1, 2);
      expect(center.my / n.my).toBeCloseTo(1, 2);
      expect(center.w / n.w).toBeCloseTo(1, 3);
    },
  );
  it("matches classical fixed square plate coefficients and is symmetric", () => {
    const p = solveSlabPlate(
      1,
      { west: true, east: true, south: true, north: true },
      0.2,
    );
    expect(p.shortPositive).toBeCloseTo(0.02113, 4);
    expect(p.westNegative).toBeCloseTo(0.05128, 3);
    expect(p.beta).toBeCloseTo(0.001265, 5);
    expect(p.shortPositive).toBeCloseTo(p.longPositive, 8);
    expect(p.westNegative).toBeCloseTo(p.northNegative, 8);
  });
  it.each([
    ["Pinned", "Pinned", 1 / 8, 5 / 384],
    ["Fixed", "Fixed", 1 / 24, 1 / 384],
    ["Fixed", "Pinned", 9 / 128, 0.00541612],
  ] as const)(
    "matches one-way %s/%s elastic moment and deflection",
    (a, b, moment, beta) => {
      const i = {
        ...defaultSlabInput(),
        lx: 5,
        ly: 2,
        supports: { ...pinned, south: a, north: b },
      };
      const r = analyzeSlab(i, false);
      expect(r.coefficients.shortPositive).toBeCloseTo(moment, 10);
      expect(r.coefficients.beta).toBeCloseTo(beta, 6);
      if (a !== b) {
        const s = r.shear.find((s) => s.edge === "south")!;
        const wu = 1.2 * r.dead + 1.6 * i.live;
        expect(s.vu).toBeCloseTo(wu * (0.625 * 2 - s.d / 1000), 8);
      }
    },
  );
  it("uses beam EI rather than plate D in one-way deflection", () => {
    const i = { ...defaultSlabInput(), lx: 5, ly: 2, supports: pinned },
      r = analyzeSlab(i, false);
    const ei = (4700 * Math.sqrt(i.fc) * 1000 * (i.h / 1000) ** 3) / 12;
    expect(r.deflection.immediate).toBeCloseTo(
      (((5 / 384) * (r.dead + i.live) * 2 ** 4) / ei) * 1000,
      8,
    );
  });
  it("rotates asymmetric supports without changing short/long demands", () => {
    const i = {
      ...defaultSlabInput(),
      lx: 2.5,
      ly: 4.3,
      supports: { ...pinned, west: "Fixed" as const, north: "Fixed" as const },
    };
    const a = analyzeSlab(i, false),
      b = analyzeSlab(
        {
          ...i,
          lx: i.ly,
          ly: i.lx,
          supports: {
            west: i.supports.south,
            east: i.supports.north,
            south: i.supports.west,
            north: i.supports.east,
          },
        },
        false,
      );
    expect(a.regions.map((r) => r.mu)).toEqual(b.regions.map((r) => r.mu));
    expect(a.coefficients.westNegative).toBeCloseTo(
      b.coefficients.southNegative,
      8,
    );
  });
  it("supports all 16 boundary combinations without zero-load false results", () => {
    for (let mask = 0; mask < 16; mask++) {
      const p = solveSlabPlate(
        1.5,
        {
          west: !!(mask & 1),
          east: !!(mask & 2),
          south: !!(mask & 4),
          north: !!(mask & 8),
        },
        0.2,
      );
      expect(p.shortPositive).toBeGreaterThan(0);
      expect(p.beta).toBeGreaterThan(0);
      expect(Number.isFinite(p.longPositive)).toBe(true);
    }
  });
  it("responds continuously to ratio and Poisson ratio without coefficient rounding", () => {
    const s = { west: true, east: true, south: true, north: true };
    const a = solveSlabPlate(1.71, s, 0.2),
      b = solveSlabPlate(1.72, s, 0.2),
      c = solveSlabPlate(1.71, s, 0.25);
    expect(a.shortPositive).not.toBe(b.shortPositive);
    expect(a.shortPositive).not.toBe(c.shortPositive);
  });
});
describe("slab reinforcement and load model", () => {
  it("computes cover-based outer short layers and restores Auto after override", () => {
    const i = defaultSlabInput(),
      b = resolveSlabBars(i);
    expect(b.map((b) => b.z)).toEqual([26, 38, 124, 112]);
    i.main["short-bottom"].elevation = 30;
    expect(resolveSlabBars(i).find((b) => b.layer === "long-bottom")!.z).toBe(
      42,
    );
    i.main["short-bottom"].elevation = null;
    expect(resolveSlabBars(i)[0].z).toBe(26);
  });
  it("calculates strain-dependent phi and independently matches a yielded single-layer section", () => {
    const i = defaultSlabInput(),
      as = 500,
      d = 125,
      r = slabFlexuralStrength(i, [{ as, d }]),
      a = (as * i.fy) / (0.85 * i.fc * 1000);
    expect(r.phiMn).toBeCloseTo((0.9 * as * i.fy * (d - a / 2)) / 1e6, 8);
    expect(r.tensionControlled).toBe(true);
    expect(slabFlexuralStrength(i, [{ as: 6000, d }]).phi).toBeLessThan(0.9);
  });
  it("extra steel helps only inside its cutoff and is distributed across full width", () => {
    const i = { ...defaultSlabInput(), lx: 5, ly: 2, supports: pinned };
    i.extra["short-bottom"].enabled = true;
    const r = analyzeSlab(i, false),
      region = r.regions[0],
      mainOnly = analyzeSlab({ ...i, extra: defaultSlabInput().extra }, false)
        .regions[0];
    expect(region.dcr).toBeLessThan(mainOnly.dcr);
    expect(region.samples.some((s) => s.position < 0.2 && !s.extra)).toBe(true);
    const b = r.bars.find((b) => b.group === "extra")!;
    expect(b.positions[0]).toBeLessThan(200);
    expect(b.positions.at(-1)!).toBeGreaterThan(4500);
  });
  it("restricts one-way extras to short direction and retains distribution steel", () => {
    const i = { ...defaultSlabInput(), lx: 5, ly: 2 };
    i.extra["long-bottom"].enabled = true;
    const r = analyzeSlab(i, false);
    expect(
      r.bars.some((b) => b.group === "extra" && b.direction === "long"),
    ).toBe(false);
    expect(
      r.bars.some((b) => b.group === "main" && b.direction === "long"),
    ).toBe(true);
    expect(analyzeSlab({ ...i, lx: 4, ly: 2 }, false).type).toBe("one-way");
  });
  it("flags crossing overlap, congested extra bars, cutoffs and missing loads", () => {
    const i = defaultSlabInput();
    i.main["long-bottom"].elevation = 26;
    expect(analyzeSlab(i, false).detailing.ok).toBe(false);
    i.main["long-bottom"].elevation = null;
    i.extra["short-top"].enabled = true;
    i.cutoffs.south = 0.05;
    expect(analyzeSlab(i, false).detailing.development.some((d) => !d.ok)).toBe(
      true,
    );
    expect(() =>
      analyzeSlab({
        ...i,
        loads: i.loads.map((l) => ({ ...l, included: false })),
      }),
    ).toThrow(/Include/);
  });
  it("rejects invalid schemas, duplicates and invalid manual elevations", () => {
    const i = defaultSlabInput();
    expect(
      slabDraftSchema.safeParse({
        kind: "slab",
        version: 1,
        input: { ...i, loads: [i.loads[0], i.loads[0]] },
      }).success,
    ).toBe(false);
    i.main["short-bottom"].elevation = 500;
    expect(() => analyzeSlab(i)).toThrow(/elevations/);
  });
  it("imports reordered Excel columns and rejects blank, duplicate and ambiguous factors", () => {
    expect(
      parseSlabLoads(
        "LiveFactor\tID\tServiceLiveFactor\tDeadFactor\n1.6\tLC1\t1\t1.2",
      )[0].deadFactor,
    ).toBe(1.2);
    expect(() =>
      parseSlabLoads(
        "ID\tDeadFactor\tLiveFactor\tServiceLiveFactor\nLC1\t\t1.6\t1",
      ),
    ).toThrow();
    expect(() =>
      parseSlabLoads(
        "ID\tDeadFactor\tLiveFactor\tServiceLiveFactor\nLC1\t1.2\t1.6\t1\nLC1\t1.4\t0\t1",
      ),
    ).toThrow();
  });
  it("suggests spacing without mutating inputs and rechecks shear with ACI 19 reinforcement-ratio effects", () => {
    const i = defaultSlabInput(),
      before = JSON.stringify(i),
      r = analyzeSlab(i);
    expect(JSON.stringify(i)).toBe(before);
    expect(r.recommendations).toHaveLength(4);
    const s = r.shear[0];
    expect(s.phiVc).toBeCloseTo(
      0.75 * 0.66 * s.lambdaS * Math.cbrt(s.rho) * Math.sqrt(i.fc) * s.d,
      8,
    );
  });
});
