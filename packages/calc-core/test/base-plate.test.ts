/**
 * Base plate engine benchmarks. Expected values come from the independent
 * hand calculation in tools/benchmarks/base_plate_reference.py (pure Python)
 * and from the user's workbook 20260901_AISC_Steel_Base_Plate_Design_00_2026ed.xlsx
 * where the methods coincide. Clauses: AISC 360-22 J8, J2; AISC DG1 3rd Ed.
 * Ch. 4; AISC Manual 16th Ed. Table 14-2; ACI 318-19 Ch. 17.
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBasePlate,
  basePlateBearing,
  basePlateDesignChecks,
  basePlateDraftSchema,
  basePlateInputSchema,
  basePlateRods,
  bondStrength,
  defaultBasePlateInput,
  dg1Axis,
  dg1LambdaNp,
  futaUsed,
  getRodSize,
  getRodSpec,
  heavyHexBearingArea,
  interaction,
  rodSpecStrength,
  shearBreakout,
  suggestBasePlateAnchors,
  table14_2,
  tensionBreakout,
  type BasePlateInput,
} from "../src";

const close = (a: number, b: number, tol = 0.001) =>
  expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);
const block = {
  px: 750,
  py: 800,
  ha: 900,
  fc: 27.6,
  lambdaA: 1,
  cracked: true,
  condition: "B" as const,
};
function load(
  id: string,
  pu: number,
  mx = 0,
  my = 0,
  vx = 0,
  vy = 0,
  seismic = false,
) {
  return { id, pu, mx, my, vx, vy, seismic, included: true };
}
/**
 * Benchmark fixture used by the hand calculations (W12X40, 450 × 500 × 32
 * plate, 750 × 800 × 900 pedestal, 4 × 3/4 in F1554 Gr 36, hef 300).
 */
function bench(): BasePlateInput {
  const d = defaultBasePlateInput();
  return {
    ...d,
    plate: { bx: 450, by: 500, tp: 32, fy: 248 },
    pedestal: { ...d.pedestal, px: 750, py: 800, height: 900 },
    anchors: {
      ...d.anchors,
      sizeId: "3/4 in",
      da: 19.05,
      ase: 215.78,
      hef: 300,
      hole: 33.3375,
      washer: { size: 50.8, thickness: 6.35 },
      eh: 57.15,
    },
    loads: [
      {
        id: "LC1",
        pu: 900,
        mx: 0,
        my: 0,
        vx: 60,
        vy: 40,
        seismic: false,
        included: true,
      },
      {
        id: "LC2",
        pu: 400,
        mx: 60,
        my: 0,
        vx: 50,
        vy: 0,
        seismic: false,
        included: true,
      },
      {
        id: "LC3",
        pu: 150,
        mx: 90,
        my: 20,
        vx: 70,
        vy: 30,
        seismic: true,
        included: true,
      },
      {
        id: "LC4",
        pu: -80,
        mx: 20,
        my: 0,
        vx: 40,
        vy: 0,
        seismic: false,
        included: true,
      },
    ],
  };
}
function withLoads(...loads: ReturnType<typeof load>[]): BasePlateInput {
  return { ...bench(), loads };
}

describe("AISC 360-22 J8 bearing", () => {
  it("uses the largest geometrically similar A2 and caps √(A2/A1) at 2", () => {
    const c = basePlateBearing(bench());
    close(c.a2, 576000);
    close(c.fpMax, 24.3984); // 0.65 × 0.85 × 27.6 × 1.6
    const big = basePlateBearing({
      ...bench(),
      pedestal: { ...bench().pedestal, px: 2000, py: 2000 },
    });
    expect(big.ratio).toBe(2);
  });
  it("Excel E4: A2 = full pedestal overstates fp for non-similar pedestals", () => {
    const i = bench();
    const c = basePlateBearing({
      ...i,
      plate: { ...i.plate, bx: 450, by: 500 },
      pedestal: { ...i.pedestal, px: 550, py: 600, fc: 28 },
    });
    close(c.a2, 324000); // workbook used 330000
    close(c.fpMax, 18.564);
  });
});

describe("AISC DG1 3rd Ed. plate design", () => {
  it("axial: m, n, λn′ and tp (hand calc 27.19 mm)", () => {
    const i = withLoads(load("A", 900));
    const r = analyzeBasePlate(i);
    const c = r.combos[0]!;
    expect(c.case).toBe("axial");
    const a = c.axes[0]!;
    close(a.m, 106.4265);
    close(a.nCant, 143.6184);
    const lam = dg1LambdaNp(i, 900, r.bearing);
    close(lam.X, 0.157687);
    close(lam.lambdaNp, 25.674);
    close(c.tpRequired, 27.1899);
  });
  it("small moment: Y = N − 2e, fp and tp (hand calc 28.66 mm)", () => {
    const c = analyzeBasePlate(withLoads(load("S", 400, 60))).combos[0]!;
    expect(c.case).toBe("small");
    close(c.axes[0]!.ecrit, 231.7839);
    close(c.axes[0]!.y, 200);
    close(c.fp, 4.4444);
    close(c.tpRequired, 28.6607);
  });
  it("large moment: Y, Tu and both interfaces (Tu 125.76 kN, tp 37.94 / 23.74 mm)", () => {
    const i = withLoads(load("L", 150, 90));
    const a = dg1Axis(
      i,
      basePlateRods(i),
      basePlateBearing(i),
      "y",
      150,
      90,
      0,
    );
    expect(a.case).toBe("large");
    close(a.y, 25.1164);
    close(a.tu, 125759.6);
    close(a.x, 50.4105);
    close(a.beff, 201.642);
    close(a.tpBearing, 37.9383);
    close(a.tpTension, 23.7369);
    const c = analyzeBasePlate(i).combos[0]!;
    expect(c.rodTension.filter((t) => t > 0)).toHaveLength(2);
    close(
      c.rodTension.find((t) => t > 0)!,
      125759.6 / 2,
    );
  });
  it("reports no solution when the plate cannot balance the moment", () => {
    const c = analyzeBasePlate(withLoads(load("N", 3000, 900))).combos[0]!;
    expect(c.case).toBe("no-solution");
    const checks = basePlateDesignChecks(
      withLoads(load("N", 3000, 900)),
      analyzeBasePlate(withLoads(load("N", 3000, 900))),
    );
    expect(checks.find((x) => x.id === "bearing")!.dcr).toBe(Infinity);
  });
  it("Excel E2: net uplift still produces rod tension and a plate requirement", () => {
    const c = analyzeBasePlate(withLoads(load("U", -200))).combos[0]!;
    expect(c.case).toBe("uplift");
    c.rodTension.forEach((t) => close(t, 50000));
    expect(c.tpRequired).toBeGreaterThan(0);
  });
  it("biaxial small eccentricity uses the effective area (Bx − 2ex)(By − 2ey)", () => {
    const c = analyzeBasePlate(withLoads(load("B", 800, 40, 20))).combos[0]!;
    expect(c.case).toBe("biaxial-small");
    close(c.fp, 800e3 / ((450 - 2 * 25) * (500 - 2 * 50)));
    expect(c.rodTension.every((t) => t === 0)).toBe(true);
  });
});

describe("ACI 318-19 Chapter 17", () => {
  it("steel strengths, F1554 Gr 36 3/4 in (φNsa 64.72 kN, φVsa 26.92 kN with grout)", () => {
    const r = analyzeBasePlate(withLoads(load("V", 300, 0, 0, 50)));
    close(r.combos[0]!.anchor.phiNsa, 64718);
    close(r.combos[0]!.anchor.phiVsa, 26923);
  });
  it("matches the workbook steel values for F1554 Gr 55, 1 in (151.56 / 63.05 kN)", () => {
    const s = getRodSize("1 in")!,
      g = rodSpecStrength(getRodSpec("F1554-55")!, s.da)!;
    const futa = futaUsed(g.fy, g.fu);
    close(0.75 * s.ase * futa, 151563);
    close(0.65 * 0.6 * s.ase * futa * 0.8, 63050);
  });
  it("breakout in tension with three near edges uses h′ef (φNcbg 107.48 kN)", () => {
    const pts = [
      { x: -170, y: -195 },
      { x: 170, y: -195 },
    ];
    const b = tensionBreakout(
      pts,
      [1, 1],
      300,
      block,
      "cast-in-headed-bolt",
      null,
      450,
    );
    expect(b.reducedForEdges).toBe(true);
    close(b.hefUsed, 136.667);
    close(b.anc, 307500);
    close(b.nb, 83936.0);
    close(0.7 * b.ncbg, 107479);
  });
  it("ψec,N reduces breakout for an eccentric tension resultant", () => {
    const pts = [
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ];
    const big = { ...block, px: 3000, py: 3000, ha: 3000 };
    const eq = tensionBreakout(
      pts,
      [1, 1],
      200,
      big,
      "cast-in-headed-bolt",
      null,
      300,
    );
    const ecc = tensionBreakout(
      pts,
      [1, 0],
      200,
      big,
      "cast-in-headed-bolt",
      null,
      300,
    );
    close(ecc.psiEc, 1 / (1 + 100 / 300));
    expect(ecc.ncbg).toBeLessThan(eq.ncbg);
  });
  it("pullout of a heavy hex head (Abrg 588.0 mm², φNpn 90.88 kN)", () => {
    close(heavyHexBearingArea(19.05), 587.985);
    const c = analyzeBasePlate(withLoads(load("L", 150, 90))).combos[0]!;
    close(c.anchor.pullout!.phiNpn, 90879);
  });
  it("shear breakout from the farthest row with welded washers (φVcbg 65.67 kN)", () => {
    const pts = [
      { x: -170, y: -195 },
      { x: -170, y: 195 },
      { x: 170, y: -195 },
      { x: 170, y: 195 },
    ];
    const s = shearBreakout(
      pts,
      "east",
      "back",
      300,
      19.05,
      block,
      "cast-in-headed-bolt",
    );
    close(s.ca1Used, 545);
    close(s.avc, 654000);
    close(s.vb, 247315);
    close(s.psiEd, 0.775229);
    close(0.7 * s.vcbg, 65668);
  });
  it("interaction envelope per 17.8", () => {
    expect(interaction(0.15, 0.9).ratio).toBe(0.9);
    expect(interaction(0.9, 0.1).ratio).toBe(0.9);
    close(interaction(0.6, 0.6).ratio, 1.0);
  });
  it("adhesive bond: cNa and Nba (17.6.5)", () => {
    const product = {
      name: "Test",
      report: "ESR-0000",
      category: 1 as const,
      kcCr: 7,
      kcUncr: 10,
      tauCr: 1.4,
      tauUncr: 4.5,
      npCr: null,
      npUncr: null,
      cac: null,
      cmin: null,
      smin: null,
    };
    const r = bondStrength(
      [{ x: 0, y: 0 }],
      [1],
      16,
      150,
      { ...block, px: 2000, py: 2000 },
      product,
    );
    close(r.cna, 123.117);
    close(r.nba, 10555.75);
    close(r.nag, r.nba);
  });
  it("seismic E combinations reduce concrete tension by 0.75 (17.10.5.4)", () => {
    const i = {
      ...withLoads(load("E", 150, 90, 0, 0, 0, true)),
      seismic: { sdc: "D" as const, option: "d" as const, stretchLength: 0 },
    };
    const e = analyzeBasePlate(i).combos[0]!.anchor.breakout!;
    const n = analyzeBasePlate(withLoads(load("N", 150, 90))).combos[0]!.anchor
      .breakout!;
    close(e.dcr, n.dcr / 0.75);
  });
});

describe("AISC Manual Table 14-2", () => {
  it("returns tabulated holes and the ≥ 2-1/2 in rule", () => {
    close(table14_2(25.4).hole, 46.0375);
    expect(table14_2(25.4).source).toBe("Table 14-2");
    close(table14_2(76.2).hole, (3 + 1.25) * 25.4);
    expect(table14_2(12.7).source).toBe("derived");
  });
});

describe("geometry and workflow", () => {
  it("Excel E8: a 3 × 3 grid with the centre rod inside the column is flagged", () => {
    const i = bench();
    const g: BasePlateInput = {
      ...i,
      anchors: { ...i.anchors, nx: 3, ny: 3, sx: 177, sy: 202 },
    };
    const checks = basePlateDesignChecks(g, analyzeBasePlate(g));
    expect(checks.find((c) => c.id === "geo-clash")!.dcr).toBe(Infinity);
  });
  it("every check carries a clause", () => {
    const i = bench();
    for (const c of basePlateDesignChecks(i, analyzeBasePlate(i)))
      expect(c.clause.length).toBeGreaterThan(3);
  });
  it("validates drafts and rejects grids outside the plate", () => {
    const i = bench();
    expect(
      basePlateDraftSchema.safeParse({
        kind: "base-plate",
        version: 1,
        input: i,
      }).success,
    ).toBe(true);
    expect(
      basePlateInputSchema.safeParse({
        ...i,
        anchors: { ...i.anchors, sx: 600 },
      }).success,
    ).toBe(false);
  });
  it("sizing assistant never mutates inputs and returns a passing size when one exists", () => {
    const i = withLoads(load("T", -150), load("C", 600, 30));
    const before = JSON.stringify(i);
    const s = suggestBasePlateAnchors(i)!;
    expect(JSON.stringify(i)).toBe(before);
    expect(s.found).toBe(true);
    expect(s.maxDcr).toBeLessThanOrEqual(1);
  });
});

describe("shared steel shapes database (AISC v16.0)", () => {
  it("loads lazily, finds imperial and metric names and maps a column snapshot", async () => {
    const { loadShapeIndex, searchShapes, getShape } =
      await import("../src/steel-shapes");
    const { basePlateColumnFromShape } = await import("../src");
    const rows = await loadShapeIndex();
    expect(rows.length).toBeGreaterThan(1600);
    expect(searchShapes(rows, "w12 x 40")[0]!.name).toBe("W12X40");
    expect(searchShapes(rows, "W310X60")[0]!.name).toBe("W12X40");
    expect(
      searchShapes(rows, "HSS8X8", ["HSS-RECT"]).every((r) =>
        r.name.startsWith("HSS8X8"),
      ),
    ).toBe(true);
    const w = await getShape("W12X40");
    // AISC v16.0: d 11.9 in, bf 8.01 in, tf 0.515 in, tw 0.295 in, A 11.7 in²
    expect(w!.d).toBeCloseTo(11.9 * 25.4, 3);
    expect(w!.bf).toBeCloseTo(8.01 * 25.4, 3);
    expect(w!.A).toBeCloseTo(11.7 * 645.16, 2);
    const col = basePlateColumnFromShape(w!, 345)!;
    expect(col).toMatchObject({ family: "I", designation: "W12X40" });
    const hss = basePlateColumnFromShape((await getShape("HSS8X8X1/2"))!, 345)!;
    expect(hss.family).toBe("HSS-RECT");
    expect(hss.tf).toBeCloseTo(0.465 * 25.4, 3); // tdes = 0.93 tnom
    const pipe = basePlateColumnFromShape((await getShape("Pipe8STD"))!, 241)!;
    expect(pipe.family).toBe("HSS-ROUND");
  });
});

describe("load paste", () => {
  it("parses tab/comma rows with an optional Seismic column and rejects bad rows atomically", async () => {
    const { parseBasePlateLoads } = await import("../src");
    const rows = parseBasePlateLoads(
      "ID\tPu\tMx\tMy\tVx\tVy\tSeismic\nLC1\t900\t0\t0\t60\t40\tN\nE1\t150\t90\t20\t70\t30\tY",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: "E1", mx: 90, seismic: true });
    expect(() => parseBasePlateLoads("ID,Pu,Mx\nA,1,2")).toThrow(/My, Vx, Vy/);
    expect(() => parseBasePlateLoads("ID,Pu,Mx,My,Vx,Vy\nA,1,2,x,0,0")).toThrow(
      /MY/,
    );
  });
});
