import { describe, expect, it } from "vitest";
import {
  analyzeSlab,
  defaultSlabInput,
  parseSlabLoads,
  resolveSlabBars,
  slabLayers,
  slabDraftSchema,
  slabDevelopmentLength,
  slabFlexuralStrength,
  slabMinimumSteelRatio,
  slabMinimumThickness,
  slabSqrtFc,
  slabCrackedSection,
  slabEffectiveInertia,
  slabTopBarFactor,
  slabSupportLayout,
  slabLoadPatch,
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
  it.each([200, 400])(
    "staggered extras at %s do not coincide with MAIN bars",
    (spacing) => {
      const input = defaultSlabInput();
      input.main["short-bottom"].spacing = 100;
      input.extra["short-bottom"].enabled = true;
      input.extra["short-bottom"].spacing = spacing;
      const result = analyzeSlab(input, false);
      const main = result.bars.find(
        (b) => b.layer === "short-bottom" && b.group === "main",
      )!;
      const extra = result.bars.find(
        (b) => b.layer === "short-bottom" && b.group === "extra",
      )!;
      for (const p of extra.positions)
        expect(
          Math.min(...main.positions.map((q) => Math.abs(p - q))),
        ).toBeGreaterThan(40);
      expect(result.regions[0].spacingOk).toBe(true);
      expect(input.extra["short-bottom"].spacing).toBe(spacing);
    },
  );
  it("combines MAIN and EXTRA area and strength at supports and midspan, with MAIN alone outside cutoffs", () => {
    const input = defaultSlabInput();
    input.lx = 2;
    input.ly = 5;
    input.extra["short-bottom"].enabled = true;
    input.extra["short-top"].enabled = true;
    const result = analyzeSlab(input, false);
    for (const layer of ["short-bottom", "short-top"] as const) {
      const region = result.regions.find((v) => v.layer === layer)!;
      const main = result.bars.find(
        (b) => b.layer === layer && b.group === "main",
      )!;
      const extra = result.bars.find(
        (b) => b.layer === layer && b.group === "extra",
      )!;
      const active = region.zones.filter((v) => v.extraAs > 0);
      expect(active.length).toBe(layer.endsWith("top") ? 2 : 1);
      for (const zone of active) {
        expect(zone.as).toBeCloseTo(main.as + extra.as, 8);
        expect(zone.extraAs).toBeCloseTo(extra.as, 8);
        expect(zone.phiMn).toBeCloseTo(
          slabFlexuralStrength(input, [main, extra]).phiMn,
          8,
        );
        const totalAs = main.as + extra.as;
        const a = (totalAs * input.fy) / (0.85 * input.fc * 1000);
        expect(zone.phiMn).toBeCloseTo(
          (0.9 * totalAs * input.fy * (main.d - a / 2)) / 1e6,
          8,
        );
      }
      for (const zone of region.zones.filter((v) => v.extraAs === 0)) {
        expect(zone.as).toBeCloseTo(main.as, 8);
        expect(zone.phiMn).toBeCloseTo(
          slabFlexuralStrength(input, [main]).phiMn,
          8,
        );
      }
      expect(Math.max(...region.zones.map((z) => z.dcr))).toBeCloseTo(
        region.dcr,
        10,
      );
    }
  });
  it("continues to report genuinely congested reinforcement", () => {
    const input = defaultSlabInput();
    input.h = 250;
    input.main["short-bottom"].spacing = 40;
    input.extra["short-bottom"].enabled = true;
    input.extra["short-bottom"].spacing = 40;
    const congested = analyzeSlab(input, false).regions[0];
    expect(congested.spacingOk).toBe(false);
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
describe("ACI 318-19 audit fixes (hand calculations)", () => {
  // f'c = 28 MPa, fy = 420 MPa, top cover 20 mm, db = 12 mm @ 150 mm, Ktr = 0.
  // cb = min(20 + 12/2, 150/2) = 26 mm; cb/db = 2.1667 (< 2.5); psi_s = 0.8 (db <= 19).
  // ld = [fy / (1.1 lambda sqrt(f'c))] psi_t psi_e psi_s psi_g / ((cb + Ktr)/db) * db
  //    = 420 / (1.1 * 5.2915) * psi_t * 0.8 / 2.1667 * 12 = 319.71 * psi_t
  const topBar = (h: number) => {
    const i = { ...defaultSlabInput(), h };
    const bar = resolveSlabBars(i).find(
      (b) => b.group === "main" && b.layer === "short-top",
    )!;
    return { i, bar };
  };
  it("applies psi_t = 1.3 to a top bar with > 300 mm of concrete cast below it (Table 25.4.2.5)", () => {
    const { i, bar } = topBar(400);
    // z = 400 - 20 - 6 = 374 mm of fresh concrete below the bar > 300 mm
    expect(bar.z).toBeCloseTo(374, 6);
    expect(slabTopBarFactor(bar)).toBe(1.3);
    const hand = ((420 / (1.1 * Math.sqrt(28))) * 1.3 * 0.8 * 12) / (26 / 12);
    expect(hand).toBeCloseTo(415.62, 1);
    expect(slabDevelopmentLength(i, bar)).toBeCloseTo(hand, 6);
    // Inner long-direction top layer: z = 374 - 6 - 6 = 362 mm, also psi_t = 1.3
    const long = resolveSlabBars(i).find(
      (b) => b.group === "main" && b.layer === "long-top",
    )!;
    expect(long.z).toBeCloseTo(362, 6);
    expect(slabTopBarFactor(long)).toBe(1.3);
  });
  it("keeps psi_t = 1.0 when concrete below the top bar is <= 300 mm, and for bottom bars", () => {
    const { i, bar } = topBar(300);
    // z = 300 - 20 - 6 = 274 mm <= 300 mm -> psi_t = 1.0; ld = 319.71 mm (> 300 mm floor)
    expect(bar.z).toBeCloseTo(274, 6);
    expect(slabTopBarFactor(bar)).toBe(1);
    expect(slabDevelopmentLength(i, bar)).toBeCloseTo(319.71, 1);
    const bottom = resolveSlabBars({ ...defaultSlabInput(), h: 1000 }).find(
      (b) => b.group === "main" && b.layer === "short-bottom",
    )!;
    expect(slabTopBarFactor(bottom)).toBe(1);
  });
  it("uses the Table 7.6.1.1 / 8.6.1.1 minimum steel ratio by fy", () => {
    expect(slabMinimumSteelRatio(275)).toBe(0.002); // fy < 420
    expect(slabMinimumSteelRatio(414)).toBe(0.002);
    expect(slabMinimumSteelRatio(420)).toBeCloseTo(0.0018, 10);
    expect(slabMinimumSteelRatio(520)).toBeCloseTo((0.0018 * 420) / 520, 10); // 0.001454
    expect(slabMinimumSteelRatio(600)).toBe(0.0014); // 0.00126 < 0.0014 floor
  });
  it("applies the fy-dependent As,min in the slab analysis", () => {
    // h = 150 mm, b = 1000 mm: fy = 275 -> 0.0020 * 150000 = 300 mm2/m; fy = 420 -> 270 mm2/m
    const low = analyzeSlab({ ...defaultSlabInput(), fy: 275 });
    const std = analyzeSlab({ ...defaultSlabInput(), fy: 420 });
    for (const r of low.regions) expect(r.minAs).toBeCloseTo(300, 6);
    for (const r of std.regions) expect(r.minAs).toBeCloseTo(270, 6);
  });
});
describe("ACI 318-19 deflection control (hand calculations)", () => {
  const withSupports = (
    lx: number,
    ly: number,
    s: Partial<ReturnType<typeof defaultSlabInput>["supports"]>,
    extra: Partial<ReturnType<typeof defaultSlabInput>> = {},
  ) => {
    const i = { ...defaultSlabInput(), lx, ly, ...extra };
    i.supports = { ...i.supports, ...s };
    return i;
  };
  it("one-way minimum thickness, Table 7.3.1.1 with 7.3.1.1.1 fy modifier (ℓ = c/c)", () => {
    // 3.0 x 7.0 m -> one-way, short span X between west and east edges
    const pp = withSupports(3, 7, { west: "Pinned", east: "Pinned" });
    expect(slabMinimumThickness(pp).hmin).toBeCloseTo(3000 / 20, 6); // 150.0
    expect(slabMinimumThickness(pp).continuity).toBe("simply supported");
    const fp = withSupports(3, 7, { west: "Fixed", east: "Pinned" });
    expect(slabMinimumThickness(fp).hmin).toBeCloseTo(3000 / 24, 6); // 125.0
    const ff = withSupports(3, 7, { west: "Fixed", east: "Fixed" });
    expect(slabMinimumThickness(ff).hmin).toBeCloseTo(3000 / 28, 6); // 107.1
    // fy = 275: 150 x (0.4 + 275/700) = 150 x 0.79286 = 118.93 mm
    const low = withSupports(
      3,
      7,
      { west: "Pinned", east: "Pinned" },
      { fy: 275 },
    );
    expect(slabMinimumThickness(low).hmin).toBeCloseTo(118.93, 2);
  });
  it("two-way minimum thickness, Table 8.3.1.2 (αfm > 2.0) with 90 mm floor", () => {
    // Default 4.3 x 2.5, 300 supports: ℓn = 4000, β = 4000/2200 = 1.818
    // 4000 x 1.1 / (36 + 16.364) = 84.03 -> 90 mm governs
    const d = slabMinimumThickness(defaultSlabInput());
    expect(d.system).toBe("two-way");
    expect(d.beta).toBeCloseTo(4000 / 2200, 6);
    expect(d.hmin).toBe(90);
    // 8 x 6: ℓn = 7700, β = 7700/5700 = 1.3509; 8470 / 48.158 = 175.88 mm
    const big = slabMinimumThickness({ ...defaultSlabInput(), lx: 8, ly: 6 });
    expect(big.hmin).toBeCloseTo(175.88, 2);
  });
  it("cracked section and effective inertia, Table 24.2.3.5", () => {
    // h 150, Ø12 @ 150 (As = 753.98 mm²/m), d = 124, f'c 28, Es 200000
    // Ec = 24870.1, n = 8.0418, x = 33.186, Icr = 62.19e6, Ig = 281.25e6
    // fr = 3.2807, Mcr = 3.2807 x 281.25e6 / 75 / 1e6 = 12.303 kN·m/m
    const as = (Math.PI * 12 ** 2) / 4 / 0.15;
    const s = slabCrackedSection({ fc: 28, es: 200000, h: 150 }, as, 124);
    expect(s.ec).toBeCloseTo(24870.06, 1);
    expect(s.x).toBeCloseTo(33.186, 2);
    expect(s.icr / 1e6).toBeCloseTo(62.188, 2);
    expect(s.ig).toBe(281.25e6);
    expect(s.mcr).toBeCloseTo(12.303, 2);
    // Ma = 15 > (2/3)Mcr = 8.20: Ie = 62.19 / [1 - (8.202/15)² x (1 - 62.19/281.25)] = 81.07e6
    expect(slabEffectiveInertia(s, 15) / 1e6).toBeCloseTo(81.066, 2);
    // Ma = 8.0 <= (2/3)Mcr: Ie = Ig
    expect(slabEffectiveInertia(s, 8)).toBe(s.ig);
  });
  it("cracked deflection governs status when h < hmin (gross stiffness would pass)", () => {
    // 8 x 6 two-way, h 130 < hmin 175.9, Ø12 @ 150 all layers, limit L/480 = 12.5 mm
    const i = {
      ...defaultSlabInput(),
      lx: 8,
      ly: 6,
      h: 130,
      deflectionDivisor: 480,
    };
    for (const l of slabLayers) i.main[l].spacing = 150;
    const r = analyzeSlab(i);
    const d = r.deflection;
    expect(d.governedBy).toBe("calculation");
    expect(d.immediate).toBeLessThan(d.limit); // gross 4.27 mm: old engine passed
    expect(d.crackedImmediate).toBeGreaterThan(d.limit); // cracked 14.2 mm
    // Δcr = Δg x Ig / Ie
    expect(d.crackedImmediate).toBeCloseTo((d.immediate * d.ig) / d.ie, 6);
    expect(r.regions.every((v) => v.dcr <= 1)).toBe(true);
    expect(r.shear.every((v) => v.dcr <= 1)).toBe(true);
    expect(d.ok).toBe(false);
    expect(r.status).toBe("REVISE");
  });
  it("h >= hmin waives calculated deflection; exceedance is information only", () => {
    // 6 x 6 two-way: ℓn = 5700, β = 1: 5700 x 1.1 / 45 = 139.33 -> h = 140 mm
    const i = {
      ...defaultSlabInput(),
      lx: 6,
      ly: 6,
      h: 140,
      live: 10,
      deflectionDivisor: 500,
    };
    const r = analyzeSlab(i);
    const d = r.deflection;
    expect(d.minimumThickness.hmin).toBeCloseTo(139.33, 2);
    expect(d.governedBy).toBe("thickness");
    expect(d.crackedImmediate).toBeGreaterThan(d.limit);
    expect(d.ok).toBe(true);
    expect(
      r.warnings.some((w) => w.startsWith("Information: h = 140 mm")),
    ).toBe(true);
  });
});
describe("ACI 318-19 √f′c ≤ 8.3 MPa limit (22.5.3.1, 25.4.1.4)", () => {
  it("caps √f′c only above f′c = 68.89 MPa", () => {
    expect(slabSqrtFc(28)).toBeCloseTo(Math.sqrt(28), 12);
    expect(slabSqrtFc(68)).toBeCloseTo(Math.sqrt(68), 12); // 8.246
    expect(slabSqrtFc(70)).toBe(8.3); // √70 = 8.367 -> 8.3
  });
  it("one-way shear uses the capped value (f'c 70 MPa)", () => {
    const r = analyzeSlab({ ...defaultSlabInput(), fc: 70 });
    for (const v of r.shear) {
      // phiVc = 0.75 min(0.66 λs ρw^(1/3), 0.42) x 8.3 x 1000 d / 1000
      const hand =
        (0.75 *
          Math.min(0.66 * v.lambdaS * Math.cbrt(v.rho), 0.42) *
          8.3 *
          1000 *
          v.d) /
        1000;
      expect(v.phiVc).toBeCloseTo(hand, 9);
    }
    // f'c 69 and 70 both exceed the limit -> identical shear capacity
    const r69 = analyzeSlab({ ...defaultSlabInput(), fc: 69 });
    expect(r69.shear.map((v) => v.phiVc)).toEqual(r.shear.map((v) => v.phiVc));
  });
  it("development length uses the capped value (f'c 70, Ø20 top bar, h 400)", () => {
    // z = 400 - 20 - 10 = 370 > 300 -> ψt = 1.3; Ø20 -> ψs = 1.0
    // cb = min(20 + 10, 150/2) = 30; cb/db = 1.5
    // ld = 420 / (1.1 x 8.3) x 1.3 / 1.5 x 20 = 797.37 mm (uncapped √70 would give 791.0)
    const i = { ...defaultSlabInput(), fc: 70, h: 400 };
    i.main["short-top"].diameter = 20;
    i.main["short-top"].spacing = 150;
    const bar = resolveSlabBars(i).find(
      (b) => b.group === "main" && b.layer === "short-top",
    )!;
    expect(bar.z).toBeCloseTo(370, 6);
    expect(slabDevelopmentLength(i, bar)).toBeCloseTo(797.37, 1);
  });
});
describe("point (patch) loads and ACI 318-19 22.6 punching shear", () => {
  const lc1 = [
    {
      id: "LC1",
      deadFactor: 1.2,
      liveFactor: 1.6,
      serviceLiveFactor: 1,
      included: true,
    },
  ];
  /** Navier mx at the centre of an SS square under a central u × u patch, per unit total load. */
  function navierPatchCentre(u: number, nu: number, terms = 400) {
    let mx = 0;
    const pi = Math.PI;
    for (let m = 1; m <= terms; m += 2)
      for (let n = 1; n <= terms; n += 2) {
        const qmn =
          (16 / (u * u * pi * pi * m * n)) *
          Math.sin((m * pi) / 2) *
          Math.sin((n * pi) / 2) *
          Math.sin((m * pi * u) / 2) *
          Math.sin((n * pi * u) / 2);
        const k = m * m + n * n;
        mx +=
          (qmn / (pi ** 4 * k * k)) *
          pi *
          pi *
          (m * m + nu * n * n) *
          Math.sin((m * pi) / 2) *
          Math.sin((n * pi) / 2);
      }
    return mx;
  }
  it("superposes the plate-FE point-load moment on the uniform solution (SS 4 × 4 m vs Navier)", () => {
    // P = 100 kN dead on 300 × 300; dispersed to mid-plane: 300 + h = 500 mm -> u = 0.5/4 = 0.125.
    const base = {
      ...defaultSlabInput(),
      lx: 4,
      ly: 4,
      h: 200,
      supports: pinned,
      loads: lc1,
    };
    const without = analyzeSlab(base, false),
      withP = analyzeSlab(
        {
          ...base,
          pointLoads: [
            {
              kind: "point" as const,
              id: "P1",
              x: 2,
              y: 2,
              bx: 300,
              by: 300,
              dead: 100,
              live: 0,
            },
          ],
        },
        false,
      );
    const m = navierPatchCentre(0.125, 0.2); // ≈ 0.2405 kN·m/m per kN
    const delta = withP.regions[0].mu - without.regions[0].mu;
    expect(delta / (1.2 * 100 * m)).toBeGreaterThan(0.995);
    expect(delta / (1.2 * 100 * m)).toBeLessThan(1.015);
    expect(withP.regions[0].position).toBeCloseTo(0.5, 6);
    expect(withP.method).toContain("point loads: Kirchhoff plate FE");
  });
  it("leaves results unchanged when no point loads are entered", () => {
    const r = analyzeSlab(defaultSlabInput());
    expect(r.punching).toEqual([]);
    expect(r.shear.every((v) => !v.concentratedWithinD)).toBe(true);
    expect(r.engineVersion).toBe("slab-0.5.0");
  });
  it("interior punching, hand calculation (h 200, 300 × 300, PD 150 + PL 100)", () => {
    const r = analyzeSlab(
      {
        ...defaultSlabInput(),
        lx: 5,
        ly: 5,
        h: 200,
        loads: lc1,
        pointLoads: [
          {
            kind: "point" as const,
            id: "P1",
            x: 2.5,
            y: 2.5,
            bx: 300,
            by: 300,
            dead: 150,
            live: 100,
          },
        ],
      },
      false,
    );
    const p = r.punching[0];
    // d = [(200 − 20 − 6) + (200 − 20 − 12 − 6)]/2 = (174 + 162)/2 = 168 mm (22.6.2.1)
    expect(p.d).toBeCloseTo(168, 9);
    // b0 = 4 (300 + 168) = 1872 mm; interior: 4 sides, αs = 40; β = 1
    expect(p.b0).toBeCloseTo(1872, 9);
    expect([p.sides, p.alphaS, p.beta]).toEqual([4, 40, 1]);
    // λs = min(1, √[2/(1 + 0.004 × 168)]) = min(1, 1.094) = 1
    expect(p.lambdaS).toBe(1);
    // vc = √28 × min(0.33, 0.17 × 3, 0.083(2 + 40 × 168/1872)) = 5.2915 × min(0.33, 0.51, 0.4640) = 1.7462 MPa
    expect(p.vc).toBeCloseTo(0.33 * Math.sqrt(28), 9);
    expect(p.vcLimits[2]).toBeCloseTo(
      0.083 * (2 + (40 * 168) / 1872) * Math.sqrt(28),
      9,
    );
    // φVc = 0.75 × 1.7462 × 1872 × 168 / 1000 = 411.88 kN
    expect(p.phiVc).toBeCloseTo(411.88, 2);
    // Vu = 1.2 × 150 + 1.6 × 100 + wu × 0.468² ; D = 0.2 × 24 + 2.4 + 0.5 = 7.7 kPa
    // wu = 1.2 × 7.7 + 1.6 × 1.92 = 12.312 kPa; A = 0.219024 m² -> Vu = 340 + 2.697 = 342.70 kN
    expect(p.area).toBeCloseTo(0.219024, 9);
    expect(p.vu).toBeCloseTo(342.697, 3);
    expect(p.dcr).toBeCloseTo(342.697 / 411.879, 3); // 0.832
  });
  it("edge punching truncated at the support face, λs < 1 (h 300, 400 × 250 at 0.45 m from the west line)", () => {
    const r = analyzeSlab(
      {
        ...defaultSlabInput(),
        lx: 3,
        ly: 9,
        h: 300,
        loads: lc1,
        supports: {
          west: "Fixed",
          east: "Fixed",
          south: "Pinned",
          north: "Pinned",
        },
        pointLoads: [
          {
            kind: "point" as const,
            id: "E1",
            x: 0.45,
            y: 4.5,
            bx: 400,
            by: 250,
            dead: 120,
            live: 80,
          },
        ],
      },
      false,
    );
    const p = r.punching[0];
    // d = (274 + 262)/2 = 268 mm; support face at 300/2 = 150 mm.
    // x: 450 − 200 − 134 = 116 < 150 -> west side dropped; x1 = 784 -> wx = 784 − 150 = 634 mm
    // y: 4500 ± (125 + 134) -> wy = 518 mm; b0 = 518 + 2 × 634 = 1786 mm; 3 sides -> αs = 30
    expect(p.d).toBeCloseTo(268, 9);
    expect(p.b0).toBeCloseTo(1786, 9);
    expect([p.sides, p.alphaS]).toEqual([3, 30]);
    expect(p.beta).toBeCloseTo(1.6, 12);
    // λs = √[2/(1 + 0.004 × 268)] = √(2/2.072) = 0.98247
    expect(p.lambdaS).toBeCloseTo(0.982472, 6);
    // vc = 0.98247 × 5.2915 × min(0.33, 0.17 × 2.25, 0.083(2 + 30 × 268/1786)) = 1.7156 MPa (a governs)
    expect(p.vc).toBeCloseTo(1.715588, 5);
    // φVc = 0.75 × 1.7156 × 1786 × 268/1000 = 615.87 kN
    expect(p.phiVc).toBeCloseTo(615.87, 1);
    // Vu = 1.2 × 120 + 1.6 × 80 + (1.2 × 10.1 + 1.6 × 1.92) × 0.634 × 0.518 = 272 + 4.989 = 276.99 kN
    expect(p.vu).toBeCloseTo(276.989, 2);
    expect(r.warnings.some((w) => w.includes("3-sided perimeter"))).toBe(true);
  });
  it("moves one-way shear to the support line for a load within d (7.4.3.2(c))", () => {
    const r = analyzeSlab(
      {
        ...defaultSlabInput(),
        lx: 3,
        ly: 9,
        h: 300,
        loads: lc1,
        pointLoads: [
          // Loaded area starts 0.25 m from the west line < d = 0.274 m
          {
            kind: "point" as const,
            id: "E1",
            x: 0.45,
            y: 4.5,
            bx: 400,
            by: 250,
            dead: 120,
            live: 80,
          },
        ],
      },
      false,
    );
    const west = r.shear.find((v) => v.edge === "west")!,
      east = r.shear.find((v) => v.edge === "east")!;
    expect(west.concentratedWithinD).toBe(true);
    expect(west.section).toBe(0);
    expect(east.concentratedWithinD).toBe(false);
    expect(east.section).toBeCloseTo(274, 9);
    // Long-span edges of a one-way panel are checked once point loads exist.
    expect(r.shear.map((v) => v.edge).sort()).toEqual([
      "east",
      "north",
      "south",
      "west",
    ]);
    // Without the load the strip gives the familiar one-way demand at d:
    // Vu = wu (0.5 × 3 − 0.274) = 15.192 × 1.226 = 18.625 kN/m
    const plain = analyzeSlab(
      { ...defaultSlabInput(), lx: 3, ly: 9, h: 300, loads: lc1 },
      false,
    ).shear.find((v) => v.edge === "west")!;
    expect(plain.vu).toBeCloseTo(15.192 * (1.5 - 0.274), 6);
    expect(west.vu).toBeGreaterThan(plain.vu);
  });
  it("counts live point loads only where adverse and never reduces demand", () => {
    const base = {
      ...defaultSlabInput(),
      lx: 5,
      ly: 6,
      h: 200,
      loads: lc1,
    };
    const deadOnly = analyzeSlab(
        {
          ...base,
          pointLoads: [
            {
              kind: "point" as const,
              id: "P1",
              x: 1.2,
              y: 1.5,
              bx: 300,
              by: 300,
              dead: 40,
              live: 0,
            },
          ],
        },
        false,
      ),
      withLive = analyzeSlab(
        {
          ...base,
          pointLoads: [
            {
              kind: "point" as const,
              id: "P1",
              x: 1.2,
              y: 1.5,
              bx: 300,
              by: 300,
              dead: 40,
              live: 60,
            },
          ],
        },
        false,
      );
    withLive.regions.forEach((g, k) =>
      expect(g.mu).toBeGreaterThanOrEqual(deadOnly.regions[k].mu - 1e-9),
    );
    withLive.shear.forEach((v, k) =>
      expect(v.vu).toBeGreaterThanOrEqual(deadOnly.shear[k].vu - 1e-9),
    );
    expect(withLive.punching[0].vu - deadOnly.punching[0].vu).toBeCloseTo(
      1.6 * 60,
      9,
    );
    expect(withLive.deflection.immediate).toBeGreaterThan(
      deadOnly.deflection.immediate,
    );
  });
  it("governs status: REVISE when punching DCR exceeds the limit", () => {
    const r = analyzeSlab(
      {
        ...defaultSlabInput(),
        lx: 5,
        ly: 5,
        h: 250,
        loads: lc1,
        pointLoads: [
          {
            kind: "point" as const,
            id: "P1",
            x: 2.5,
            y: 2.5,
            bx: 150,
            by: 150,
            dead: 300,
            live: 200,
          },
        ],
      },
      false,
    );
    expect(r.punching[0].dcr).toBeGreaterThan(1);
    expect(r.status).toBe("REVISE");
  });
  it("validates loaded areas inside the panel and keeps legacy drafts loadable", () => {
    expect(() =>
      analyzeSlab({
        ...defaultSlabInput(),
        pointLoads: [
          {
            kind: "point" as const,
            id: "P1",
            x: 0.1,
            y: 1,
            bx: 300,
            by: 300,
            dead: 10,
            live: 0,
          },
        ],
      }),
    ).toThrow(/within the slab panel/);
    const { pointLoads: _omit, ...legacy } = defaultSlabInput();
    void _omit;
    const parsed = slabDraftSchema.parse({
      kind: "slab",
      version: 1,
      input: legacy,
    });
    expect(parsed.input.pointLoads).toEqual([]);
  });
});
describe("cantilever slabs (one Fixed edge, three Free edges)", () => {
  const lc1 = [
    {
      id: "LC1",
      deadFactor: 1.2,
      liveFactor: 1.6,
      serviceLiveFactor: 1,
      included: true,
    },
  ];
  const cantilever = (
    fixed: "west" | "east" | "south" | "north" = "west",
    extra: Partial<ReturnType<typeof defaultSlabInput>> = {},
  ) => {
    const alongX = fixed === "west" || fixed === "east";
    return {
      ...defaultSlabInput(),
      lx: alongX ? 1.5 : 6,
      ly: alongX ? 6 : 1.5,
      h: 180,
      loads: lc1,
      supports: {
        west: "Free",
        east: "Free",
        south: "Free",
        north: "Free",
        [fixed]: "Fixed",
      } as ReturnType<typeof defaultSlabInput>["supports"],
      ...extra,
    };
  };
  it("classifies support layouts and suggests the edge to fix", () => {
    const L = (s: Record<string, string>) =>
      slabSupportLayout({
        supports: s as ReturnType<typeof defaultSlabInput>["supports"],
      });
    expect(
      L({ west: "Fixed", east: "Fixed", south: "Pinned", north: "Pinned" })
        .kind,
    ).toBe("panel");
    expect(
      L({ west: "Free", east: "Free", south: "Free", north: "Fixed" }),
    ).toMatchObject({ kind: "cantilever", fixedEdge: "north" });
    expect(
      L({ west: "Pinned", east: "Free", south: "Free", north: "Free" }),
    ).toMatchObject({ kind: "unstable", suggest: ["west"] });
    expect(
      L({ west: "Free", east: "Free", south: "Free", north: "Free" }).suggest,
    ).toEqual(["west", "east", "south", "north"]);
    // Stable but Phase 2: two Pinned (opposite or adjacent), or more than one Fixed.
    expect(
      L({ west: "Pinned", east: "Pinned", south: "Free", north: "Free" }).kind,
    ).toBe("unsupported");
    expect(
      L({ west: "Pinned", east: "Free", south: "Pinned", north: "Free" }).kind,
    ).toBe("unsupported");
    expect(
      L({ west: "Fixed", east: "Fixed", south: "Free", north: "Free" }).kind,
    ).toBe("unsupported");
    expect(() =>
      analyzeSlab(
        cantilever("west", {
          supports: {
            west: "Pinned",
            east: "Free",
            south: "Free",
            north: "Free",
          },
        }),
      ),
    ).toThrow(/Unstable supports.*Set the west edge to Fixed/);
  });
  it("hand calculation: ℓ = 1.5 m, h 180, Fixed west (strip shear, ℓ/10, Ie at support)", () => {
    const r = analyzeSlab(cantilever("west"), false);
    expect(r.type).toBe("cantilever");
    expect([r.shortSpan, r.longSpan, r.shortAxis]).toEqual([1.5, 6, "X"]);
    // D = 0.18 × 24 + 2.4 + 0.5 = 7.22 kPa; wu = 1.2 × 7.22 + 1.6 × 1.92 = 11.736 kPa
    expect(r.dead).toBeCloseTo(7.22, 12);
    // Table 7.3.1.1 cantilever: hmin = 1500/10 = 150 mm <= 180
    expect(r.deflection.minimumThickness.hmin).toBeCloseTo(150, 9);
    expect(r.deflection.minimumThickness.system).toBe("cantilever");
    // One-way shear at d from the root only: d = 180 − 20 − 6 = 154 mm
    // Vu = 11.736 × (1.5 − 0.154) = 15.797 kN/m
    expect(r.shear.map((v) => v.edge)).toEqual(["west"]);
    expect(r.shear[0].d).toBeCloseTo(154, 9);
    expect(r.shear[0].vu).toBeCloseTo(11.736 * (1.5 - 0.154), 9);
    // Root moment: strip wuℓ²/2 = 13.203 kN·m/m; plate FE peak within +4 %
    const root = r.regions.find((g) => g.id === "short-negative")!;
    const strip = (11.736 * 1.5 ** 2) / 2;
    expect(root.mu / strip).toBeGreaterThan(1.0);
    expect(root.mu / strip).toBeLessThan(1.04);
    expect(root.position).toBe(0);
    expect(root.label).toBe("Cantilever root negative / top");
    // Bottom steel has no flexural demand under gravity (minimum steel governs)
    expect(r.regions.find((g) => g.id === "short-positive")!.dcr).toBeLessThan(
      0.01,
    );
    // Tip deflection ≈ ws ℓ⁴/(8D), D = Ec h³/[12(1 − ν²)]; limit ℓ/240 = 6.25 mm
    const ec = 4700 * Math.sqrt(28),
      D = (ec * 1000 * 0.18 ** 3) / 12 / (1 - 0.2 ** 2),
      hand = (((7.22 + 1.92) * 1.5 ** 4) / (8 * D)) * 1000;
    expect(r.deflection.immediate / hand).toBeGreaterThan(0.995);
    expect(r.deflection.immediate / hand).toBeLessThan(1.02);
    expect(r.deflection.limit).toBeCloseTo(6.25, 12);
    expect(r.deflection.ieAt).toBe("support");
    // Top-bar anchorage: Ø12, z = 154 ≤ 300 -> ψt = 1; cb = 26; ld = 420/(1.1 √28) × 0.8 / (26/12) × 12 = 319.7 mm
    expect(r.detailing.anchorage!.ld).toBeCloseTo(319.71, 1);
    expect(r.status).toBe("SCREENING PASS");
  });
  it("gives the same design for every Fixed-edge orientation", () => {
    const base = analyzeSlab(cantilever("west"), false);
    for (const edge of ["east", "south", "north"] as const) {
      const r = analyzeSlab(cantilever(edge), false);
      expect(r.regions.map((g) => g.mu)).toEqual(
        base.regions.map((g) => expect.closeTo(g.mu, 6)),
      );
      expect(r.shear[0].edge).toBe(edge);
      expect(r.shear[0].vu).toBeCloseTo(base.shear[0].vu, 9);
      expect(r.deflection.immediate).toBeCloseTo(base.deflection.immediate, 6);
    }
  });
  it("punching near free edges opens the perimeter (hand calculation)", () => {
    const r = analyzeSlab(
      cantilever("west", {
        pointLoads: [
          // 0.2 m from the tip: closed 4-sided fits but the 3-sided open perimeter governs
          {
            kind: "point" as const,
            id: "P1",
            x: 1.3,
            y: 3,
            bx: 200,
            by: 200,
            dead: 10,
            live: 5,
          },
          // at the free corner
          {
            kind: "point" as const,
            id: "P2",
            x: 1.35,
            y: 0.2,
            bx: 150,
            by: 150,
            dead: 8,
            live: 0,
          },
          // interior
          {
            kind: "point" as const,
            id: "P3",
            x: 0.75,
            y: 3,
            bx: 200,
            by: 200,
            dead: 10,
            live: 0,
          },
        ],
      }),
      false,
    );
    const [p1, p2, p3] = r.punching;
    // d = (154 + 142)/2 = 148; P1: x0 = 1300 − 100 − 74 = 1126 -> to edge 1500: wx = 374; wy = 348
    // b0 = 348 + 2 × 374 = 1096 (3 sides, αs 30); vc = 0.33√28 (a governs)
    expect(p1.d).toBeCloseTo(148, 9);
    expect(p1.b0).toBeCloseTo(1096, 9);
    expect([p1.sides, p1.alphaS, p1.openEdges]).toEqual([3, 30, ["east"]]);
    expect(p1.phiVc).toBeCloseTo(
      (0.75 * 0.33 * Math.sqrt(28) * 1096 * 148) / 1000,
      6,
    ); // 212.44
    // Closed alternative 4 × 348 = 1392 gives 269.8 kN > 212.4 -> open governs (least φVc)
    // P2 corner: wx = 1500 − 1201 = 299; wy = 0 + 349 = 349; b0 = 648 (2 sides, αs 20)
    expect(p2.b0).toBeCloseTo(648, 9);
    expect([p2.sides, p2.alphaS]).toEqual([2, 20]);
    expect(p2.openEdges.sort()).toEqual(["east", "south"]);
    // P3 interior: b0 = 4 × 348 = 1392, αs 40
    expect(p3.b0).toBeCloseTo(1392, 9);
    expect([p3.sides, p3.alphaS, p3.openEdges]).toEqual([4, 40, []]);
  });
  it("keeps supported panels unchanged (no Free edge)", () => {
    const r = analyzeSlab(defaultSlabInput(), false);
    expect(r.type).toBe("two-way");
    expect(r.deflection.ieAt).toBe("midspan");
    expect(r.detailing.anchorage).toBeNull();
  });
});
describe("line and area loads", () => {
  const lc1 = [
    {
      id: "LC1",
      deadFactor: 1.2,
      liveFactor: 1.6,
      serviceLiveFactor: 1,
      included: true,
    },
  ];
  it("converts line and area loads to loaded rectangles and resultants", () => {
    // Line along X from (1, 2), 3 m long, 200 mm thick: 5 kN/m x 3 = 15 kN
    expect(
      slabLoadPatch({
        kind: "line",
        id: "W1",
        x: 1,
        y: 2,
        direction: "X",
        length: 3,
        thickness: 200,
        dead: 5,
        live: 1,
      }),
    ).toEqual({
      id: "W1",
      kind: "line",
      x0: 1,
      x1: 4,
      y0: 1.9,
      y1: 2.1,
      dead: 15,
      live: 3,
    });
    // Area 2000 x 1000 mm at (2, 2): 3 kPa x 2 m² = 6 kN
    expect(
      slabLoadPatch({
        kind: "area",
        id: "A1",
        x: 2,
        y: 2,
        bx: 2000,
        by: 1000,
        dead: 3,
        live: 2,
      }),
    ).toEqual({
      id: "A1",
      kind: "area",
      x0: 1,
      x1: 3,
      y0: 1.5,
      y1: 2.5,
      dead: 6,
      live: 4,
    });
  });
  it("full-width line load matches the Navier plate solution (SS 3 x 8 m)", () => {
    const pin = {
      west: "Pinned",
      east: "Pinned",
      south: "Pinned",
      north: "Pinned",
    } as const;
    const base = {
      ...defaultSlabInput(),
      lx: 3,
      ly: 8,
      h: 150,
      loads: lc1,
      supports: pin,
    };
    const r0 = analyzeSlab(base, false),
      r1 = analyzeSlab(
        {
          ...base,
          pointLoads: [
            {
              kind: "line",
              id: "W1",
              x: 1.5,
              y: 0,
              direction: "Y",
              length: 8,
              thickness: 150,
              dead: 10,
              live: 0,
            },
          ],
        },
        false,
      );
    // Navier mx at (1.5, 4) for P = 1 over 0.3 m (150 + h) x 8 m strip, ν = 0.2
    let m = 0;
    const pi = Math.PI,
      a = 3,
      b = 8,
      u = 0.3,
      q0 = 1 / (u * b);
    for (let i = 1; i <= 400; i += 2)
      for (let j = 1; j <= 400; j += 2) {
        const qmn =
          ((16 * q0) / (pi * pi * i * j)) *
          Math.sin((i * pi * 1.5) / a) *
          Math.sin((j * pi * 4) / b) *
          Math.sin((i * pi * u) / (2 * a)) *
          Math.sin((j * pi) / 2);
        const k = (i / a) ** 2 + (j / b) ** 2;
        m +=
          (qmn / (pi ** 4 * k * k)) *
          pi *
          pi *
          ((i / a) ** 2 + 0.2 * (j / b) ** 2) *
          Math.sin((i * pi * 1.5) / a) *
          Math.sin((j * pi * 4) / b);
      }
    // ≈ 0.0829 per kN: 6.9 % below the beam value wL/4 − wb/8 (short-edge restraint)
    const delta = r1.regions[0].mu - r0.regions[0].mu,
      expected = 1.2 * 10 * 8 * m;
    expect(delta / expected).toBeGreaterThan(0.995);
    expect(delta / expected).toBeLessThan(1.015);
    expect(r1.punching).toEqual([]);
  });
  it("a full-panel area load equals the same kPa added to SDL (within 0.2 %)", () => {
    const base = { ...defaultSlabInput(), lx: 5, ly: 6, h: 180, loads: lc1 };
    const sdl = analyzeSlab({ ...base, sdl: base.sdl + 2 }, false),
      area = analyzeSlab(
        {
          ...base,
          pointLoads: [
            {
              kind: "area",
              id: "A1",
              x: 2.5,
              y: 3,
              bx: 5000,
              by: 6000,
              dead: 2,
              live: 0,
            },
          ],
        },
        false,
      );
    area.regions.forEach((g, k) =>
      expect(Math.abs(g.mu / sdl.regions[k].mu - 1)).toBeLessThan(0.002),
    );
  });
  it("cantilever parapet line load: root moment = w x lever arm (dispersion keeps the centroid)", () => {
    const r = (pl: ReturnType<typeof defaultSlabInput>["pointLoads"]) =>
      analyzeSlab(
        {
          ...defaultSlabInput(),
          lx: 1.5,
          ly: 6,
          h: 180,
          loads: lc1,
          supports: {
            west: "Fixed",
            east: "Free",
            south: "Free",
            north: "Free",
          },
          pointLoads: pl,
        },
        false,
      ).regions.find((g) => g.id === "short-negative")!.mu;
    // 200 mm parapet centred 0.1 m from the tip: lever arm 1.4 m, w = 4 kN/m -> 1.2 x 4 x 1.4 = 6.72 kN·m/m
    const delta =
      r([
        {
          kind: "line",
          id: "PP",
          x: 1.4,
          y: 0,
          direction: "Y",
          length: 6,
          thickness: 200,
          dead: 4,
          live: 0,
        },
      ]) - r([]);
    expect(delta / (1.2 * 4 * 1.4)).toBeGreaterThan(0.99);
    expect(delta / (1.2 * 4 * 1.4)).toBeLessThan(1.04);
  });
  it("punching is for point loads only; 7.4.3.2(c) applies to point and line loads, not area loads", () => {
    const base = { ...defaultSlabInput(), lx: 3, ly: 9, h: 300, loads: lc1 };
    const line = analyzeSlab(
      {
        ...base,
        pointLoads: [
          {
            kind: "line",
            id: "W1",
            x: 0.2,
            y: 2,
            direction: "Y",
            length: 5,
            thickness: 150,
            dead: 8,
            live: 0,
          },
        ],
      },
      false,
    );
    expect(line.shear.find((v) => v.edge === "west")!.concentratedWithinD).toBe(
      true,
    );
    const area = analyzeSlab(
      {
        ...base,
        pointLoads: [
          {
            kind: "area",
            id: "A1",
            x: 0.3,
            y: 4,
            bx: 400,
            by: 1000,
            dead: 5,
            live: 0,
          },
        ],
      },
      false,
    );
    expect(area.shear.find((v) => v.edge === "west")!.concentratedWithinD).toBe(
      false,
    );
    const mixed = analyzeSlab(
      {
        ...base,
        pointLoads: [
          {
            kind: "point",
            id: "P1",
            x: 1.5,
            y: 6,
            bx: 300,
            by: 300,
            dead: 20,
            live: 0,
          },
          {
            kind: "line",
            id: "W1",
            x: 0.2,
            y: 2,
            direction: "Y",
            length: 5,
            thickness: 150,
            dead: 8,
            live: 0,
          },
          {
            kind: "area",
            id: "A1",
            x: 1.5,
            y: 8,
            bx: 1000,
            by: 1000,
            dead: 5,
            live: 0,
          },
        ],
      },
      false,
    );
    expect(mixed.punching.map((p) => p.id)).toEqual(["P1"]);
  });
  it("warns about double counting walls in Partition, validates extents, keeps legacy point loads", () => {
    const r = analyzeSlab(
      {
        ...defaultSlabInput(),
        partition: 1,
        pointLoads: [
          {
            kind: "line",
            id: "W1",
            x: 0.5,
            y: 1,
            direction: "X",
            length: 2,
            thickness: 150,
            dead: 6,
            live: 0,
          },
        ],
      },
      false,
    );
    expect(
      r.warnings.some(
        (w) => w.startsWith("Double counting") && w.includes("W1"),
      ),
    ).toBe(true);
    expect(() =>
      analyzeSlab({
        ...defaultSlabInput(),
        pointLoads: [
          {
            kind: "line",
            id: "W1",
            x: 3,
            y: 1,
            direction: "X",
            length: 2,
            thickness: 150,
            dead: 6,
            live: 0,
          },
        ],
      }),
    ).toThrow(/must lie within the slab panel/);
    const parsed = slabDraftSchema.parse({
      kind: "slab",
      version: 1,
      input: {
        ...defaultSlabInput(),
        pointLoads: [
          { id: "P1", x: 2, y: 1, bx: 300, by: 300, dead: 10, live: 0 },
        ],
      },
    });
    expect(parsed.input.pointLoads[0].kind).toBe("point");
  });
});
