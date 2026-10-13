import { describe, expect, it } from "vitest";
import {
  adoptTieDesignToQuantity,
  columnStrainState,
  columnVc,
  confinementLayout,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  designColumnTransverse,
  estimateColumnQuantity,
  nominalMomentAtP,
  parseColumnLoads,
  shearSection,
  type ColumnTieDesignInput,
  type RectangularColumnInput,
} from "../src";

// 500×500, f′c 28, fy 420, 12-D25 (4 per face at ±187.5, ±62.5), cover 40,
// D10 ties fyt 420 with 2 interior cross-ties each way (4 legs each way).
const face = [-187.5, -62.5, 62.5, 187.5];
const bars = [
  ...face.flatMap((x) => [-187.5, 187.5].map((y) => ({ x, y, diameter: 25 }))),
  ...[-62.5, 62.5].flatMap((y) =>
    [-187.5, 187.5].map((x) => ({ x, y, diameter: 25 })),
  ),
];
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 500,
  depth: 500,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars,
  loads: [
    {
      id: "U1",
      description: "",
      pu: 1500,
      mx: 100,
      my: 50,
      vx: 0,
      vy: 300,
      included: true,
    },
  ],
};
const tie = (
  over: Partial<ColumnTieDesignInput> = {},
): ColumnTieDesignInput => {
  const t = defaultColumnTieDesign(input, 3000);
  return {
    ...t,
    shear: { enabled: true },
    tie: { ...t.tie, interiorX: 2, interiorY: 2 },
    ...over,
  };
};

describe("column shear, ACI 318-19 22.5 — hand calculation", () => {
  // Vuy = 300 kN along y: bw = 500 mm; tension bars 4 at y = −187.5, 2 at −62.5
  //   d = 250 + (4·187.5 + 2·62.5)/6 = 395.83 mm; As = 2945.2 mm²; ρw = 0.014881
  //   Nu/6Ag = 1.5e6/(6·250000) = 1.00 MPa ≤ 0.05f′c = 1.40
  //   Vc(a) = (0.17√28 + 1.00)·500·395.83 = 375.95 kN; (b) = 367.93 kN ⇒ 375.95
  //   Av = 4·78.54 = 314.16 mm²; Av,min/s = 0.35·500/420 = 0.4167 mm²/mm
  //   Vs,req = 300/0.75 − 375.95 = 24.05 kN (small) ⇒ s ≤ d/2 = 197.9 (10.7.6.5.2)
  //   ⇒ s = 175 mm; Vs = 314.16·420·395.83/175 = 298.45 kN
  //   φVn = 0.75(375.95 + 298.45) = 505.80 kN; DCR = 0.5931
  it("section properties and Vc", () => {
    const sy = shearSection(input, "y", 4, 10);
    expect(sy.bw).toBe(500);
    expect(sy.d).toBeCloseTo(395.833, 3);
    expect(sy.rhoW).toBeCloseTo(0.014881, 6);
    expect(sy.av).toBeCloseTo(314.159, 3);
    expect(columnVc(28, 250000, sy, 1500, true).vc).toBeCloseTo(375.954, 2);
    // Av < Av,min uses (c) with λs = √(2/(1 + 0.004d)) = 0.880
    const c = columnVc(28, 250000, sy, 1500, false);
    expect(c.lambdaS).toBeCloseTo(Math.sqrt(2 / (1 + 0.004 * sy.d)), 12);
    expect(c.lambdaS).toBeCloseTo(0.88, 2);
  });
  it("designs spacing and checks the governing combination", () => {
    const r = designColumnTransverse(input, tie());
    expect(r.recommended.sMid).toBe(175);
    const g = r.shear.find((c) => c.dir === "y")!;
    expect(g.vc).toBeCloseTo(375.954, 2);
    expect(g.vs).toBeCloseTo(298.451, 2);
    expect(g.phiVn).toBeCloseTo(505.804, 2);
    expect(g.dcr).toBeCloseTo(0.59312, 4);
    expect(r.checks.find((c) => c.id === "shear:mid:y")!.dcr).toBeCloseTo(
      0.59312,
      4,
    );
  });
  it("biaxial shear interaction only when both ratios exceed 0.5 (22.5.1.10)", () => {
    const both = {
      ...input,
      loads: [{ ...input.loads[0]!, vx: 300, vy: 300 }],
    };
    const r = designColumnTransverse(
      both,
      tie({
        override: { lo: null, sEnd: null, sMid: 175, veX: null, veY: null },
      }),
    );
    const s = r.biaxialShear[0]!;
    expect(s.sum).toBeCloseTo(2 * 0.59312, 3);
    expect(r.checks.find((c) => c.id === "shear:biaxial")!.dcr).toBeCloseTo(
      (2 * 0.59312) / 1.5,
      3,
    );
  });
  it("overrides are checked, not trusted", () => {
    const r = designColumnTransverse(
      input,
      tie({
        override: { lo: null, sEnd: null, sMid: 300, veX: null, veY: null },
      }),
    );
    expect(r.adopted.sMid).toBe(300);
    expect(
      r.checks.find((c) => c.id === "ties:spacing-mid")!.dcr,
    ).toBeGreaterThan(1);
  });
});

describe("SMF confinement, ACI 318-19 18.7.5 — hand calculation", () => {
  // ℓu 3000: lo = max(500, 500, 450) = 500 mm (18.7.5.1)
  // All 12 bars supported; hx = 125 mm; so = 100 + (350 − 125)/3 = 175 → 150
  // s in lo ≤ min(500/4 = 125, 6·25 = 150, 150) = 125 (18.7.5.3)
  // Pu 1500 < 0.3Ag f′c = 2100 kN ⇒ Table 18.7.5.4 (a), (b):
  //   Ach = 420² ; (a) 0.3(250000/176400 − 1)(28/420) = 0.0083447; (b) 0.006
  //   Ash = 4·78.54 = 314.16 ⇒ s ≤ 314.16/(0.0083447·420) = 89.64 ⇒ 75 mm
  // Outside lo ≤ min(6db, 150) = 150 (18.7.5.5)
  const smf = tie({
    confinement: {
      ...defaultColumnTieDesign(input, 3000).confinement,
      enabled: true,
      frame: "SMF",
    },
  });
  it("layout, lo, so, Ash and recommended spacing", () => {
    const lay = confinementLayout(bars, 2, 2);
    expect(lay.nl).toBe(12);
    expect(lay.hx).toBeCloseTo(125, 9);
    expect(lay.legsX).toBe(4);
    const r = designColumnTransverse(input, smf);
    expect(r.lo).toBe(500);
    expect(r.ash[0]!.ratio).toBeCloseTo(0.0083447, 6);
    expect(r.ash[0]!.sMax).toBeCloseTo(89.638, 2);
    expect(r.recommended.sEnd).toBe(75);
    expect(r.limits.find((l) => l.clause === "18.7.5.3")!.end).toBe(125);
    expect(r.limits.find((l) => l.clause === "18.7.5.5")!.mid).toBe(150);
  });
  it("Ve = 2Mpr/ℓu with Mpr at 1.25fy and φ = 1.0 (18.7.6.1.1)", () => {
    const r = designColumnTransverse(input, smf);
    const mpr = nominalMomentAtP(input, "x", 1500, 1.25);
    expect(r.ve.y).toBeCloseTo((2 * mpr * 1000) / 3000, 6);
    // Mpr exceeds Mn at fy, which matches the uniaxial engine's nominal curve.
    const mn = nominalMomentAtP(input, "x", 1500, 1);
    expect(mpr).toBeGreaterThan(mn);
    let lo = 1,
      hi = 5000;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (columnStrainState(input, "x", 1, mid).pn < 1500) lo = mid;
      else hi = mid;
    }
    expect(mn).toBeCloseTo(columnStrainState(input, "x", 1, hi).mn, 4);
  });
  it("Vc = 0 in lo when Pu < Ag f′c/20 (18.7.6.2.1)", () => {
    const low = { ...input, loads: [{ ...input.loads[0]!, pu: 300 }] };
    const r = designColumnTransverse(low, smf);
    expect(r.shear.filter((c) => c.zone === "end").every((c) => c.vcZero)).toBe(
      true,
    );
    expect(
      r.shear.filter((c) => c.zone === "mid").every((c) => !c.vcZero),
    ).toBe(true);
  });
  it("high axial load adds Table 18.7.5.4 (c) and the 200 mm hx limit", () => {
    const high = { ...input, loads: [{ ...input.loads[0]!, pu: 2500 }] };
    const r = designColumnTransverse(high, smf);
    // kf = 28/175 + 0.6 = 0.76 → 1.0; kn = 12/10 = 1.2
    const c = (0.2 * 1 * 1.2 * 2500e3) / (420 * 176400);
    expect(r.ash[0]!.terms.c).toBeCloseTo(c, 9);
    expect(r.checks.find((x) => x.id === "smf:hx")!.dcr).toBeCloseTo(
      125 / 200,
      9,
    );
  });
});

describe("adopt to estimate", () => {
  it("writes lo / middle / lo / joint zones that the estimate accepts", () => {
    const r = designColumnTransverse(
      input,
      tie({
        confinement: {
          ...defaultColumnTieDesign(input, 3000).confinement,
          enabled: true,
        },
      }),
    );
    const q = {
      ...defaultColumnQuantity(10),
      enabled: true,
      height: 3500,
      beamDepth: 500,
    };
    const next = adoptTieDesignToQuantity(q, tie().tie, r);
    expect(next.zones.map((z) => [z.name, z.start, z.end, z.spacing])).toEqual([
      ["Lower lo zone", 0, 500, 75],
      ["Middle zone", 500, 2500, r.adopted.sMid],
      ["Upper lo zone", 2500, 3000, 75],
      ["Beam-column joint", 3000, 3500, 75],
    ]);
    expect(next.zones.every((z) => z.legsX === 4 && z.legsY === 4)).toBe(true);
    expect(estimateColumnQuantity(input, next)).not.toBeNull();
  });
});

describe("load import with shears and end moments", () => {
  it("reads Vux/Vuy, ETABS V2/V3 and M1 columns", () => {
    const a = parseColumnLoads(
      "Combo\tPu\tMux\tMuy\tVux\tVuy\tM1x\n1\t1000\t50\t20\t15\t40\t-25",
    );
    expect(a[0]).toMatchObject({ pu: 1000, vx: 15, vy: 40, m1x: -25 });
    const b = parseColumnLoads(
      "Combo\tPu\tM2\tM3\tV2\tV3\nU1\t900\t60\t30\t12\t34",
    );
    expect(b[0]).toMatchObject({ mx: 60, my: 30, vx: 12, vy: 34 });
  });
});

describe("Materials tie flows into the estimate", () => {
  it("syncs every zone except overrides and clears checked lengths on resize", async () => {
    const { syncColumnQuantityTies } = await import("../src");
    const q = { ...defaultColumnQuantity(10), enabled: true };
    q.zones[0]!.hoopLength = 1800;
    q.zones[1] = { ...q.zones[1]!, override: true, diameter: 12, fy: 280 };
    const next = syncColumnQuantityTies(q, {
      diameter: 12,
      fy: 420,
      gradeId: "PNS-420W",
    });
    expect(next.zones[0]).toMatchObject({
      diameter: 12,
      fy: 420,
      gradeId: "PNS-420W",
      hoopLength: null,
    });
    expect(next.zones[1]).toMatchObject({
      diameter: 12,
      fy: 280,
      override: true,
    });
    // Already in sync: same object back (no needless re-render or save).
    expect(
      syncColumnQuantityTies(next, {
        diameter: 12,
        fy: 420,
        gradeId: "PNS-420W",
      }),
    ).toBe(next);
  });
  it("biaxial shear row states the sum against the 1.5 limit", () => {
    const both = {
      ...input,
      loads: [{ ...input.loads[0]!, vx: 300, vy: 300 }],
    };
    const r = designColumnTransverse(
      both,
      tie({
        override: { lo: null, sEnd: null, sMid: 175, veX: null, veY: null },
      }),
    );
    const c = r.checks.find((x) => x.id === "shear:biaxial")!;
    const sum = r.biaxialShear[0]!.sum;
    expect(c.label).toBe(`Biaxial shear Σ = ${sum.toFixed(3)} vs limit 1.5`);
    expect(c.detail).toContain("≤ 1.5");
    expect(c.dcr).toBeCloseTo(sum / 1.5, 9);
  });
});
