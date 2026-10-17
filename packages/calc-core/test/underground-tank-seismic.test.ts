/**
 * ACI 350.3-20 seismic loads on rectangular tanks: dynamic-model equations by
 * hand and against the published figures (Fig. 9.2.1, 9.2.2, 9.2.3, 9.2.4),
 * spectrum coefficients, pressure distributions, base shear, freeboard.
 */
import { describe, expect, it } from "vitest";

import {
  defaultTankInput,
  designTank,
  linearDistribution,
  tankCc,
  tankCi,
  tankEpsilon,
  tankHcIbpRatio,
  tankHcRatio,
  tankHiIbpRatio,
  tankHiRatio,
  tankInputSchema,
  tankResponseFactor,
  tankSeismicDirection,
  tankTc,
  tankWcRatio,
  tankWiRatio,
} from "../src";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("ACI 350.3-20 dynamic model, rectangular tanks (Ch. 9)", () => {
  it("effective weights (9.2.1) by hand and against Fig. 9.2.1 at L/HL = 2.5", () => {
    expect(tankWiRatio(2.5)).toBeCloseTo(Math.tanh(0.866 * 2.5) / (0.866 * 2.5), 12);
    expect(tankWcRatio(2.5)).toBeCloseTo(0.264 * 2.5 * Math.tanh(3.16 / 2.5), 12);
    expect(tankWiRatio(2.5)).toBeCloseTo(0.45, 2);
    expect(tankWcRatio(2.5)).toBeCloseTo(0.56, 2);
    // Fig. 9.2.1 end points: L/HL = 0.5 → Wi/WL ≈ 0.94, L/HL = 8 → Wc/WL ≈ 0.79.
    expect(tankWiRatio(0.5)).toBeCloseTo(0.94, 2);
    expect(tankWcRatio(8)).toBeCloseTo(0.79, 2);
  });
  it("heights EBP (9.2.2) and IBP (9.2.3) against Fig. 9.2.2 / 9.2.3", () => {
    expect(tankHiRatio(1)).toBeCloseTo(0.5 - 0.09375, 12);
    expect(tankHiRatio(2)).toBe(0.375);
    expect(tankHcRatio(0.5)).toBeCloseTo(0.84, 2);
    expect(tankHcRatio(8)).toBeCloseTo(0.505, 2);
    expect(tankHiIbpRatio(0.5)).toBe(0.45);
    expect(tankHiIbpRatio(8)).toBeCloseTo(3.33, 1);
    expect(tankHcIbpRatio(8)).toBeCloseTo(6.8, 1);
  });
  it("convective period (9.2.4f) against Fig. 9.2.4 (2π/λ × 1.811 in SI)", () => {
    // Fig. 9.2.4: 2π/λ ≈ 0.675 (ft) at L/HL = 2.5 → SI 1.222; Tc = 1.222·√8.
    expect(rel(tankTc(8, 3.2), 0.675 * 1.811 * Math.sqrt(8))).toBeLessThan(0.01);
  });
  it("effective mass coefficient (9.6.1)", () => {
    expect(tankEpsilon(2.5)).toBeCloseTo(0.0151 * 6.25 - 0.1908 * 2.5 + 1.021, 12);
    expect(tankEpsilon(0.05)).toBe(1);
  });
  it("spectrum coefficients (9.4.1, 9.4.2)", () => {
    expect(tankCi(1, 0.6, 0.3)).toBe(1);
    expect(tankCi(1, 0.6, 1.2)).toBeCloseTo(0.5, 12);
    expect(tankCc(1, 0.6, 3.458, 8)).toBeCloseTo((1.5 * 0.6) / 3.458, 12);
    expect(tankCc(1, 0.6, 0.5, 8)).toBe(1.5);
    expect(tankCc(1, 0.6, 10, 8)).toBeCloseTo((1.5 * 0.6 * 8) / 100, 12);
  });
  it("R5.3.1 linear distributions integrate to P/2 at height h (both branches)", () => {
    for (const [H, h] of [
      [3.2, 1.2],
      [3.2, 2.4],
    ] as const) {
      let F = 0,
        M = 0;
      const n = 4000;
      for (let k = 0; k < n; k++) {
        const y = ((k + 0.5) * H) / n,
          p = linearDistribution(50, H, h, y);
        F += (p * H) / n;
        M += (p * y * H) / n;
      }
      expect(rel(F, 50)).toBeLessThan(1e-4);
      expect(rel(M / F, h)).toBeLessThan(1e-3);
    }
  });
});

const base = {
  sds: 1,
  sd1: 0.6,
  tl: 8,
  importance: 1.25,
  ri: 3.25,
  rc: 1,
  b: 2 / 3,
  ec: 24870,
  gammaC: 24,
  gammaL: 9.81,
  L: 8,
  B: 5,
  hl: 3.2,
  hw: 5,
  tw: 0.3,
  wallWeight: 800,
  roofWeight: 500,
  roofThickness: 0.25,
  roof: true,
  soilHeight: 4,
  gammaSoil: 18,
  gammaSat: 20,
  gammaW: 9.81,
  groundwater: false,
  yielding: false,
  clf: 2.2,
};

describe("ACI 350.3-20 forces (Ch. 4, 8)", () => {
  const d = tankSeismicDirection(base);
  it("forces 4.1.1 and base shear 4.1.2 by hand (adequate freeboard)", () => {
    expect(d.kr).toBe(0);
    expect(d.ti).toBe(0);
    const wl = 9.81 * 8 * 5 * 3.2,
      wi = wl * tankWiRatio(2.5),
      wc = wl * tankWcRatio(2.5),
      eps = tankEpsilon(2.5),
      cc = tankCc(1, 0.6, tankTc(8, 3.2), 8);
    expect(d.pi).toBeCloseTo((1 * 1.25 * wi) / 3.25, 9);
    expect(d.pc).toBeCloseTo((cc * 1.25 * wc) / 1, 9);
    expect(d.pw).toBeCloseTo((1 * 1.25 * eps * 800) / 3.25, 9);
    expect(d.pr).toBeCloseTo((1 * 1.25 * 500) / 3.25, 9);
    // R8.1b non-yielding, no groundwater, per unit width × (B + 2tw).
    const peg = (1 / 2.5) * 18 * 16 * (1.25 / 3.25) * 5.6;
    expect(d.peg).toBeCloseTo(peg, 9);
    expect(d.v).toBeCloseTo(Math.sqrt((d.pi + d.pw + d.pr) ** 2 + d.pc ** 2 + peg ** 2), 9);
    expect(d.uv).toBeCloseTo(Math.max((1 * 1.25 * (2 / 3)) / 3.25, 0.2), 12);
    expect(d.dmax).toBeCloseTo((8 / 2) * cc * 1.25, 12);
  });
  it("dynamic earth pressure resultant at 0.6H with the R8.1 force", () => {
    let F = 0,
      M = 0;
    const n = 4000;
    for (let k = 0; k < n; k++) {
      const y = ((k + 0.5) * 4) / n,
        p = d.earth(y);
      F += (p * 4) / n;
      M += (p * y * 4) / n;
    }
    expect(rel(F * 5.6, d.peg)).toBeLessThan(1e-4);
    expect(rel(M / F, 0.6 * 4)).toBeLessThan(1e-3);
  });
  it("inadequate freeboard applies the R7.1 confined mass and roof uplift", () => {
    const t = tankSeismicDirection({ ...base, hw: 3.5 });
    expect(t.kr).toBeGreaterThan(0);
    expect(t.uplift).toBeCloseTo(2.2 * 9.81 * (t.dmax / 1.25 - 0.3), 9);
    expect(t.li).toBeCloseTo((8 / Math.PI) * Math.acos(0.3 / t.dmax), 9);
    expect(t.pc).toBeLessThan(d.pc);
  });
  it("open tank: cantilever impulsive period from R9.2.4", () => {
    const t = tankSeismicDirection({ ...base, roof: false });
    expect(t.ti).toBeGreaterThan(0);
    expect(t.ti).toBeLessThan(0.3);
  });
  it("Ri from Table 4.1.1b: 2.25 on grade, 3.25 buried, linear between", () => {
    const i = defaultTankInput();
    expect(tankResponseFactor({ ...i, soil: { ...i.soil, ground: 0 } })).toBe(2.25);
    expect(tankResponseFactor({ ...i, soil: { ...i.soil, ground: 10 } })).toBe(3.25);
    expect(tankResponseFactor({ ...i, liquid: { depth: 4, gamma: 9.81 }, soil: { ...i.soil, ground: 2 } })).toBeCloseTo(2.75, 12);
  });
});

describe("Seismic tank design", () => {
  it("adds the seismic wall cases with Sd = 1 and the freeboard checks", () => {
    const r = designTank(defaultTankInput());
    expect(r.seismic).not.toBeNull();
    expect(r.checks.some((c) => c.id.startsWith("freeboard"))).toBe(true);
    const seis = r.panels.flatMap((p) => p.peaks).filter((p) => p.case.startsWith("Seismic"));
    for (const p of seis) expect(p.sd).toBe(1);
  });
  it("switches off cleanly", () => {
    const r = designTank(tankInputSchema.parse({ ...defaultTankInput(), seismic: { ...defaultTankInput().seismic, enabled: false } }));
    expect(r.seismic).toBeNull();
    expect(r.checks.some((c) => c.id.startsWith("freeboard"))).toBe(false);
  });
});
