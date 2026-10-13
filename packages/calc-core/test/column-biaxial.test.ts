import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  biaxialCapacityAt,
  biaxialDesignStateAt,
  biaxialRawStateAt,
  biaxialSection,
  breslerReciprocal,
  columnCapacityAt,
  columnStrainState,
  type RectangularColumnInput,
} from "../src";

const deg = (d: number) => (d * Math.PI) / 180;
const kipft = (kipIn: number) => kipIn / 12;

describe("3D biaxial strain compatibility — StructurePoint ACI 318-19 benchmarks", () => {
  // StructurePoint, "Manual Design Procedure for Columns and Walls with Biaxial
  // Bending (ACI 318-11/14/19)", exact method: 24×24 in, 4 #11 corner bars at
  // 2.0 in from each face, f′c 5 ksi, fy 60 ksi, β1 0.80. c = 25.11 in, NA
  // angle 25.24° ⇒ Pn = 1846 kip, Mnx = 608, Mny = 245.4 kip-ft.
  it("24×24 in, 4#11: Pn, Mnx, Mny within 0.5%", () => {
    const db = Math.sqrt((1.56 * 4) / Math.PI);
    const g = 10;
    const s = {
      width: 24,
      depth: 24,
      fc: 5,
      fy: 60,
      es: 29000,
      beta1: 0.8,
      bars: [
        [-g, -g],
        [g, -g],
        [g, g],
        [-g, g],
      ].map(([x, y]) => ({ x: x!, y: y!, diameter: db })),
    };
    const r = biaxialRawStateAt(s, deg(90 - 25.24), 25.11);
    expect(r.p).toBeCloseTo(1846, -1);
    expect(Math.abs(r.p / 1846 - 1)).toBeLessThan(0.005);
    expect(Math.abs(kipft(r.mx) / 608 - 1)).toBeLessThan(0.005);
    expect(Math.abs(kipft(r.my) / 245.4 - 1)).toBeLessThan(0.005);
  });
  // StructurePoint, "Biaxial Bending Interaction Diagrams for Rectangular RC
  // Column Design (ACI 318-19)": 16×20 in, 10 #8, f′c 6 ksi, β1 0.75,
  // c = 12.50 in, α = 43.9° ⇒ hand Pn 425.37 kip, Mnx 321.28, Mny 200.64
  // kip-ft, compressed concrete area 87.96 in².
  it("16×20 in, 10#8: Pn, Mnx, Mny and block area within 0.5%", () => {
    const db = Math.sqrt((0.79 * 4) / Math.PI);
    const bars = [
      [-5.5, -7.5],
      [-5.5, -2.5],
      [-5.5, 2.5],
      [-5.5, 7.5],
      [0, -7.5],
      [0, 7.5],
      [5.5, -7.5],
      [5.5, -2.5],
      [5.5, 2.5],
      [5.5, 7.5],
    ].map(([x, y]) => ({ x: x!, y: y!, diameter: db }));
    const s = {
      width: 16,
      depth: 20,
      fc: 6,
      fy: 60,
      es: 29000,
      beta1: 0.75,
      bars,
    };
    const r = biaxialRawStateAt(s, deg(90 - 43.9), 12.5);
    expect(Math.abs(r.p / 425.37 - 1)).toBeLessThan(0.005);
    expect(Math.abs(kipft(r.mx) / 321.28 - 1)).toBeLessThan(0.005);
    expect(Math.abs(kipft(r.my) / 200.64 - 1)).toBeLessThan(0.005);
    expect(r.concreteArea).toBeCloseTo(87.96, 1);
  });
});

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 500,
  depth: 700,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-187.5, -62.5, 62.5, 187.5]
    .flatMap((x) => [-287.5, 287.5].map((y) => ({ x, y, diameter: 25 })))
    .concat(
      [-95.83, 95.83].flatMap((y) =>
        [-187.5, 187.5].map((x) => ({ x, y, diameter: 25 })),
      ),
    ),
  loads: [
    { id: "U1", description: "", pu: 2500, mx: 300, my: 150, included: true },
    { id: "U2", description: "", pu: 800, mx: 0, my: 260, included: true },
    { id: "U3", description: "", pu: 4500, mx: 200, my: -200, included: true },
    { id: "U4", description: "", pu: 200, mx: -380, my: 120, included: true },
  ],
};

describe("3D engine consistency with the uniaxial engine (22.2)", () => {
  it("reproduces uniaxial states on the principal axes", () => {
    const s = biaxialSection(input);
    for (const c of [80, 200, 400, 800]) {
      const x = columnStrainState(input, "x", 1, c);
      const b = biaxialDesignStateAt(s, Math.PI / 2, c);
      expect(b.designP).toBeCloseTo(x.designP, 6);
      expect(b.designMx).toBeCloseTo(x.designM, 6);
      expect(b.designMy).toBeCloseTo(0, 6);
      const y = columnStrainState(input, "y", -1, c);
      const by = biaxialDesignStateAt(s, Math.PI, c);
      expect(by.designP).toBeCloseTo(y.designP, 6);
      expect(by.designMy).toBeCloseTo(y.designM, 6);
    }
  });
  it("is never less conservative than the linear screen, and is equal on an axis", () => {
    const r = analyzeRectangularColumn(input);
    for (const c of r.checks) {
      expect(c.biaxialRatio).not.toBeNull();
      expect(c.biaxialRatio!).toBeLessThanOrEqual((c.interaction ?? 0) + 1e-6);
    }
    const onAxis = r.checks.find((c) => c.load.id === "U2")!;
    expect(onAxis.biaxialRatio!).toBeCloseTo(onAxis.interaction!, 4);
  });
  it("finds the capacity on the load ray (moment angle equals demand angle)", () => {
    const s = biaxialSection(input);
    const cap = biaxialCapacityAt(s, 2500, 300, 150)!;
    expect(Math.atan2(cap.my, cap.mx)).toBeCloseTo(Math.atan2(150, 300), 5);
    expect(cap.ratio).toBeCloseTo(Math.hypot(300, 150) / cap.capacity, 9);
  });
});

describe("Bresler reciprocal load (reference check)", () => {
  const s = biaxialSection(input);
  it("evaluates 1/φPni = 1/φPnx + 1/φPny − 1/φPo", () => {
    const b = breslerReciprocal(s, 2500, 300, 150);
    expect(b.applicable).toBe(true);
    expect(1 / b.pni!).toBeCloseTo(1 / b.pnx! + 1 / b.pny! - 1 / b.po, 12);
    expect(b.ratio).toBeCloseTo(2500 / b.pni!, 12);
    // φPo = 0.65·P0 (22.4.2.2, Table 21.2.2)
    const ast = (input.bars.length * (Math.PI * 25 ** 2)) / 4;
    expect(b.po).toBeCloseTo(
      (0.65 * (0.85 * 28 * (500 * 700 - ast) + 420 * ast)) / 1000,
      6,
    );
  });
  it("reduces to the uniaxial capacity when one moment is zero", () => {
    const b = breslerReciprocal(s, 2500, 300, 0);
    expect(b.pni).toBeCloseTo(b.pnx!, 6);
    // φPnx lies on the x design curve at eccentricity e = Mux/Pu = 120 mm:
    // φMnx(φPnx) = e·φPnx.
    const r = analyzeRectangularColumn(input);
    const curve = r.curves.find((c) => c.axis === "x" && c.direction === 1)!;
    expect(b.pnx!).toBeLessThan(r.axialCap);
    expect(columnCapacityAt(input, curve, b.pnx!)).toBeCloseTo(
      0.12 * b.pnx!,
      2,
    );
  });
  it("is not applied when Pu/0.65 < 0.10 f′c Ag", () => {
    const b = breslerReciprocal(s, 200, -380, 120);
    expect(b.applicable).toBe(false);
    expect(b.ratio).toBeNull();
  });
});
