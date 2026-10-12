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
  slabCrackedSection,
  slabEffectiveInertia,
  slabTopBarFactor,
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
