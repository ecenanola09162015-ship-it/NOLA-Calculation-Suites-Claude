import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  concreteModulus,
  defaultColumnSlenderness,
  slenderDirection,
  type RectangularColumnInput,
} from "../src";

// Hand calculation, ACI 318-19 6.2.5 / 6.6.4. 400×400 mm, f′c 28 MPa,
// 8-D20 perimeter bars at ±140 mm, ℓu 6000 mm, k 1.0, nonsway, βdns 0.6,
// Pu 1200 kN, M2 60 kN·m, M1 30 kN·m same diagram sign (single curvature).
//   r = 0.3h = 120 mm; kℓu/r = 50; M1/M2 = −0.5 ⇒ limit 34 + 12(−0.5) = 28.
//   Ec = 4700√28 = 24 870.06 MPa; Ig = 400⁴/12 = 2.1333e9 mm⁴.
//   (a) 0.4EcIg/(1+βdns) = 1.32640e13 N·mm²
//   (b) (0.2EcIg + EsIse)/(1+βdns), Ise = 6·314.16·140² ⇒ 1.12502e13
//   EI = 1.32640e13; Pc = π²EI/(kℓu)² = 3636.41 kN.
//   Cm = 0.6 − 0.4(−0.5) = 0.80; δns = 0.80/(1 − 1200/(0.75·3636.41)) = 1.42856
//   M2,min = 1200(15 + 0.03·400)/1000 = 32.4 kN·m < 60 ⇒ Mc = 85.713 kN·m.
//   6.2.5.3: δ = 1.4286 > 1.4 ⇒ DCR 1.020.
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 400,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-140, 0, 140]
    .flatMap((x) => [-140, 0, 140].map((y) => ({ x, y, diameter: 20 })))
    .filter((b) => b.x !== 0 || b.y !== 0),
  loads: [
    {
      id: "U1",
      description: "",
      pu: 1200,
      mx: 60,
      my: 0,
      m1x: 30,
      included: true,
    },
  ],
  slenderness: {
    ...defaultColumnSlenderness(6000),
    enabled: true,
  },
};

describe("Slenderness, moment magnification (ACI 318-19 6.2.5, 6.6.4)", () => {
  it("nonsway hand calculation", () => {
    const d = slenderDirection(input, input.slenderness!, "x", 1200, 60, 30);
    expect(concreteModulus(28)).toBeCloseTo(24870.06, 1);
    expect(d.r).toBe(120);
    expect(d.klur).toBeCloseTo(50, 9);
    expect(d.m1m2).toBeCloseTo(-0.5, 9);
    expect(d.limit).toBeCloseTo(28, 9);
    expect(d.slender).toBe(true);
    expect(d.ei! / 1e13).toBeCloseTo(1.3264, 4);
    expect(d.pc).toBeCloseTo(3636.41, 1);
    expect(d.cm).toBeCloseTo(0.8, 9);
    expect(d.delta).toBeCloseTo(1.42856, 4);
    expect(d.m2min).toBeCloseTo(32.4, 9);
    expect(d.mc).toBeCloseTo(85.713, 2);
  });
  it("double curvature raises the limit, capped at 40 (6.2.5.1b, c)", () => {
    const d = slenderDirection(input, input.slenderness!, "x", 1200, 60, -60);
    expect(d.m1m2).toBeCloseTo(1, 9);
    expect(d.limit).toBe(40);
    expect(d.cm).toBeCloseTo(0.2, 9);
  });
  it("short column: kℓu/r within the limit is not magnified", () => {
    const sl = {
      ...input.slenderness!,
      x: { ...input.slenderness!.x, lu: 2500 },
    };
    const d = slenderDirection(input, sl, "x", 1200, 60, 30);
    expect(d.klur).toBeCloseTo(20.833, 3);
    expect(d.slender).toBe(false);
    expect(d.mc).toBe(60);
  });
  it("M2,min governs small moments with Cm = 1.0 (6.6.4.5.4)", () => {
    const d = slenderDirection(input, input.slenderness!, "x", 1200, 10, 5);
    expect(d.cm).toBe(1);
    expect(d.mc).toBeCloseTo(32.4 / (1 - 1200 / (0.75 * d.pc!)), 6);
  });
  it("sway: δs = 1/(1 − Q) and limit 22 (6.6.4.6.2a, 6.2.5.1a)", () => {
    const sl = {
      ...input.slenderness!,
      swayMethod: "stability-index" as const,
      x: { ...input.slenderness!.x, sway: true, q: 0.2 },
    };
    const d = slenderDirection(input, sl, "x", 1200, 60, 30);
    expect(d.limit).toBe(22);
    expect(d.delta).toBeCloseTo(1.25, 9);
    expect(d.mc).toBeCloseTo(75, 9);
    const p = slenderDirection(
      input,
      { ...sl, swayMethod: "second-order" },
      "x",
      1200,
      60,
      30,
    );
    expect(p.delta).toBe(1);
  });
  it("unstable when Pu ≥ 0.75Pc", () => {
    const d = slenderDirection(input, input.slenderness!, "x", 2800, 60, 30);
    expect(d.unstable).toBe(true);
  });
  it("feeds magnified moments into the section check", () => {
    const r = analyzeRectangularColumn(input);
    const c = r.checks[0]!;
    expect(c.mux).toBeCloseTo(85.713, 2);
    expect(c.slenderness!.x.secondOrderRatio).toBeCloseTo(1.42856, 4);
    const off = analyzeRectangularColumn({
      ...input,
      slenderness: { ...input.slenderness!, enabled: false },
    });
    expect(off.checks[0]!.mux).toBe(60);
    expect(off.checks[0]!.slenderness).toBeNull();
  });
});
