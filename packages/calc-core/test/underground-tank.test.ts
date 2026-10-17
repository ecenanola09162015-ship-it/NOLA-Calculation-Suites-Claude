/**
 * Underground tank (tank-0.1.0): ACI 350 durability factor and stress limits
 * by hand, section strength, plate benchmarks (Timoshenko simply supported
 * rectangle, long-wall cantilever), flotation by hand, schema limits.
 */
import { describe, expect, it } from "vitest";

import {
  defaultTankInput,
  designTank,
  sectionStrength,
  slabFlexuralStrength,
  tankBarArea,
  tankCheckSections,
  tankFsMax,
  tankInputSchema,
  tankSd,
  tankShrinkageRatio,
} from "../src";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("ACI 350 service stress limits and Sd", () => {
  it("fs,max flexure, normal exposure, h 300 (β 1.35), Ø16 @ 200 = 25.95 ksi", () => {
    const s = 200 / 25.4,
      db = 16 / 25.4;
    const ksi = 320 / (1.35 * Math.sqrt(s * s + 4 * (2 + db / 2) ** 2));
    expect(tankFsMax("normal", "flexure", 300, { diameter: 16, spacing: 200 })).toBeCloseTo(ksi * 6.894757, 6);
    expect(ksi).toBeCloseTo(25.95, 2);
  });
  it("caps flexure at 36 / 30 ksi and direct tension at 20 / 17 ksi; β = 1.2 for h ≥ 16 in", () => {
    expect(tankFsMax("normal", "flexure", 450, { diameter: 10, spacing: 75 })).toBeCloseTo(36 * 6.894757, 6);
    expect(tankFsMax("severe", "flexure", 450, { diameter: 10, spacing: 75 })).toBeCloseTo(30 * 6.894757, 6);
    expect(tankFsMax("normal", "tension", 300, { diameter: 16, spacing: 200 })).toBeCloseTo(137.9, 1);
    expect(tankFsMax("severe", "tension", 300, { diameter: 16, spacing: 200 })).toBeCloseTo(117.2, 1);
  });
  it("Sd = φfy/(γ fs) ≥ 1", () => {
    expect(tankSd(420, 1.4, 179)).toBeCloseTo((0.9 * 420) / (1.4 * 179), 9);
    expect(tankSd(280, 1.6, 250)).toBe(1);
  });
  it("shrinkage and temperature ratio by joint spacing (Grade 60 / 40)", () => {
    expect(tankShrinkageRatio(420, 5)).toBe(0.003);
    expect(tankShrinkageRatio(420, 8)).toBe(0.004);
    expect(tankShrinkageRatio(420, 10)).toBe(0.005);
    expect(tankShrinkageRatio(420, 20)).toBe(0.005);
    expect(tankShrinkageRatio(275, 8)).toBe(0.005);
    expect(tankShrinkageRatio(275, 20)).toBe(0.006);
  });
});

describe("Section strength with axial tension", () => {
  it("equals the slab strength with no compression steel and no axial force", () => {
    const a = sectionStrength(28, 420, 200000, 300, { as: 1000, d: 250 }, { as: 0, d: 50 }, 0);
    const b = slabFlexuralStrength({ fc: 28, fy: 420, es: 200000 }, [{ as: 1000, d: 250 }]);
    // Moments about mid-depth vs about the steel differ by N·e = 0 when N = 0.
    expect(rel(a.phiMn, b.phiMn)).toBeLessThan(1e-4);
  });
  it("loses capacity with tension and reaches zero at the steel tension limit", () => {
    const t = { as: 1000, d: 250 },
      c = { as: 1000, d: 50 };
    const m0 = sectionStrength(28, 420, 200000, 300, t, c, 0).phiMn,
      m1 = sectionStrength(28, 420, 200000, 300, t, c, 200).phiMn;
    expect(m1).toBeLessThan(m0);
    expect(sectionStrength(28, 420, 200000, 300, t, c, 2000 * 0.42 + 1).phiMn).toBe(0);
  });
});

describe("Panel benchmarks", () => {
  it("roof, simply supported b/a = 1.5: my(centre) = 0.0784 q a² (Timoshenko, ν = 0.2)", () => {
    const i = tankInputSchema.parse({ ...defaultTankInput(), lx: 5.7, ly: 3.7, wall: 0.3, roof: { enabled: true, thickness: 0.25, edge: "pinned", cover: 0, live: 0 }, divisions: 16 });
    const r = designTank(i);
    const roof = r.panels.find((p) => p.id === "roof")!;
    // Governing case 1.4D. Timoshenko Table 8 (ν = 0.3): β1 0.0812, β2 0.0498 → ν = 0.2:
    // m1 = (β1 − 0.3β2)/0.91, m2 = β2 − 0.3m1, β1(0.2) = m1 + 0.2m2 = 0.0784.
    const q = 1.4 * 24 * 0.25;
    const m1 = (0.0812 - 0.3 * 0.0498) / 0.91,
      m2 = 0.0498 - 0.3 * m1;
    // Short span a = 4.0 m along y.
    expect(rel(roof.field("frontY", 3, 2), (m1 + 0.2 * m2) * q * 16)).toBeLessThan(0.01);
  });
  it("long open wall, leak test: base moment = 1.4·γ·HL³/6 plus the half-slab offset", () => {
    const i = tankInputSchema.parse({
      ...defaultTankInput(),
      lx: 40,
      ly: 40,
      height: 4,
      base: 0.4,
      roof: { ...defaultTankInput().roof, enabled: false },
      liquid: { depth: 4, gamma: 10 },
      soil: { ...defaultTankInput().soil, water: 0 },
      seismic: { ...defaultTankInput().seismic, enabled: false },
      divisions: 16,
    });
    const r = designTank(i);
    const wall = r.panels.find((p) => p.id === "long")!;
    const e = 0.2,
      HL = 4,
      g = 10;
    const m = (g * HL ** 3) / 6 + ((g * HL * HL) / 2) * e + (g * HL * e * e) / 2;
    expect(rel(wall.field("frontY", wall.length / 2, 0), 1.4 * m)).toBeLessThan(0.02);
  });
});

describe("Tank design", () => {
  const r = designTank(defaultTankInput());
  it("computes flotation by hand", () => {
    const i = defaultTankInput();
    const ox = i.lx + 2 * i.wall,
      oy = i.ly + 2 * i.wall,
      bx = ox + 2 * i.projection,
      by = oy + 2 * i.projection;
    const conc = 24 * (2 * (ox + i.ly) * i.wall * i.height + bx * by * i.base + ox * oy * i.roof.thickness);
    const cover = i.roof.cover * 18 * ox * oy;
    const hwc = i.soil.water - i.base;
    const proj = (bx * by - ox * oy) * (18 * (i.soil.ground - hwc) + 20 * hwc);
    const U = 9.81 * i.soil.water * bx * by;
    expect(rel(r.flotation.fs, (conc + cover + proj) / U)).toBeLessThan(1e-9);
  });
  it("groups checks into stability, walls, base, roof and detailing", () => {
    expect(tankCheckSections(r).map((s) => s.title)).toEqual(["Stability", "Walls", "Base Slab", "Roof Slab", "Detailing"]);
    expect(r.checks.every((c) => c.clause.length > 0)).toBe(true);
  });
  it("applies Sd > 1 to the leak test and direct tension to the horizontal bars", () => {
    const leak = r.panels[0]!.peaks.find((p) => p.face === "frontX")!;
    expect(leak.sd).toBeGreaterThan(1);
    expect(leak.nu).toBeGreaterThan(0);
  });
  it("bar areas per metre", () => {
    expect(tankBarArea({ diameter: 16, spacing: 200 })).toBeCloseTo(1005.3, 1);
  });
  it("rejects a liquid deeper than the tank", () => {
    expect(() => tankInputSchema.parse({ ...defaultTankInput(), liquid: { depth: 5, gamma: 9.81 } })).toThrow();
  });
});
