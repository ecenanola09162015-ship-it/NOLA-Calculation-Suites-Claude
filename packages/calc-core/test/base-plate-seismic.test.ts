/**
 * Seismic design (engine base-plate-0.5.0): activation, AISC 341-22 D2.6
 * strong base, and the weak base of AISC DG1 3rd Ed. 6.4.2 benchmarked on
 * Example 6.4-1 (W12×96, 20 × 20 plate, 3 + 3 F1554 Gr 55 UT rods).
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBasePlate,
  basePlateColumnZ,
  basePlateDesignChecks,
  basePlateDraftSchema,
  defaultBasePlateInput,
  type BasePlateInput,
} from "../src";

const IN = 25.4,
  KSI = 6.894757,
  KIP = 4.448222,
  KIPIN = 0.112985;
const close = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);

describe("activation", () => {
  it("is off by default: E flags and ACI 17.10 are ignored", () => {
    const i = defaultBasePlateInput();
    const lc3 = analyzeBasePlate(i).combos.find((c) => c.load.id === "LC3")!;
    expect(i.seismic.active).toBe(false);
    expect(lc3.earthquake).toBe(false);
    expect(lc3.anchor.breakout?.seismicFactor ?? 1).toBe(1);
  });
  it("activated with SDC D applies 17.10.5.4 to E combinations", () => {
    const i = defaultBasePlateInput();
    i.seismic = { ...i.seismic, active: true, sdc: "D" };
    const lc3 = analyzeBasePlate(i).combos.find((c) => c.load.id === "LC3")!;
    expect(lc3.earthquake).toBe(true);
    expect(lc3.anchor.breakout!.seismicFactor).toBe(0.75);
  });
  it("17.10.3 exemption keeps the E flag but drops 17.10", () => {
    const i = defaultBasePlateInput();
    i.seismic = { ...i.seismic, active: true, sdc: "D", exempt20: true };
    const lc3 = analyzeBasePlate(i).combos.find((c) => c.load.id === "LC3")!;
    expect(lc3.earthquake).toBe(true);
    expect(lc3.seismicApplies).toBe(false);
  });
  it("older drafts with SDC C–F open active, A–B inactive", () => {
    const d = (sdc: string) => {
      const i = defaultBasePlateInput() as unknown as Record<string, unknown>;
      i.seismic = { sdc, option: "d", stretchLength: 0 };
      return basePlateDraftSchema.parse({ kind: "base-plate", version: 1, input: i })
        .input.seismic;
    };
    expect(d("D").active).toBe(true);
    expect(d("B").active).toBe(false);
    expect(d("D").baseType).toBe("general");
  });
  it("ASD with seismic needs the LRFD combinations", () => {
    const i = defaultBasePlateInput();
    i.designMethod = "ASD";
    i.seismic = { ...i.seismic, active: true };
    expect(() => analyzeBasePlate(i)).toThrow(/LRFD combinations/);
  });
});

describe("strong base (AISC 341-22 D2.6c(a))", () => {
  it("adds M = 1.1 Ry Fy Z / αs for each E combination", () => {
    const i = defaultBasePlateInput();
    i.seismic = { ...i.seismic, active: true, sdc: "D", baseType: "strong" };
    const r = analyzeBasePlate(i);
    const mp = r.combos.find((c) => c.load.id === "LC3·Mp")!;
    // W12X40 Zx 934,063 mm³ (AISC v16.0), Ry 1.1, Fy 345 MPa.
    expect(basePlateColumnZ(i, "x")).toBeCloseTo(934062.648, 3);
    close(mp.load.mx, (1.1 * 1.1 * 345 * 934062.648) / 1e6, 1e-9);
    expect(mp.load.pu).toBe(150);
    expect(mp.earthquake).toBe(true);
  });
  it("Z from dimensions for custom sections (I: bf tf (d − tf) + tw hw²/4)", () => {
    const i = defaultBasePlateInput();
    i.column = { ...i.column, zx: null, zy: null };
    const c = i.column;
    const hw = c.d - 2 * c.tf;
    close(
      basePlateColumnZ(i, "x"),
      c.bf * c.tf * (c.d - c.tf) + (c.tw * hw * hw) / 4,
      1e-12,
    );
  });
});

function ex641(lug: boolean): BasePlateInput {
  const i = defaultBasePlateInput();
  i.column = {
    ...i.column,
    designation: "W12X96",
    d: 12.7 * IN,
    bf: 12.2 * IN,
    tf: 0.9 * IN,
    tw: 0.55 * IN,
    fy: 50 * KSI,
    zx: null,
    zy: null,
  };
  i.plate = { bx: 20 * IN, by: 20 * IN, tp: 1.25 * IN, fy: 50 * KSI, fu: 65 * KSI };
  i.pedestal = {
    ...i.pedestal,
    px: 120 * IN,
    py: 120 * IN,
    height: 60 * IN,
    fc: 4 * KSI,
    fcPsi: 4000,
  };
  i.grout = { thickness: 1 * IN };
  i.anchors = {
    ...i.anchors,
    da: 1 * IN,
    ase: 0.606 * IN * IN,
    fy: 55 * KSI,
    fu: 75 * KSI,
    nx: 3,
    ny: 2,
    sx: 8 * IN,
    sy: 16 * IN,
    hef: 24 * IN,
    abrg: 3.21 * IN * IN,
  };
  i.shear = lug
    ? {
        ...i.shear,
        method: "lug",
        lug: {
          ...i.shear.lug,
          orientation: "y",
          width: 8 * IN,
          thickness: 1.5 * IN,
          depth: 2 * IN,
        },
      }
    : { ...i.shear, method: "anchors" };
  i.seismic = {
    ...i.seismic,
    active: true,
    sdc: "D",
    baseType: "weak",
    ut: { dReduced: 0.75 * IN, lStretch: 8 * IN, rt: 1.2 },
  };
  i.loads = [
    {
      id: "E",
      pu: 376 * KIP,
      mx: 3600 * KIPIN,
      my: 0,
      vx: 0,
      vy: 50 * KIP,
      seismic: true,
      included: true,
    },
  ];
  return i;
}

describe("DG1 Ex. 6.4-1 weak base with ductile UT anchor rods", () => {
  const i = ex641(true);
  const r = analyzeBasePlate(i);
  const w = r.combos[0]!.weakBase!;
  it("lug moment 100 kip-in → 3,700 kip-in; dreduced ≥ 0.687 in", () => {
    close(r.combos[0]!.lugMoment!.mx / KIPIN, 100, 0.002);
    expect(w.applies).toBe(true);
    expect(w.n).toBe(3);
    close(w.dReq / IN, 0.687, 0.01);
  });
  it("Treduced 33.1 kips ≤ threaded 34.1 kips; Rt Treduced 39.7 kips", () => {
    close(w.tReduced / 1e3 / KIP, 33.1, 0.003);
    close(w.threadCap / 1e3 / KIP, 34.1, 0.003);
    close(w.rtT / 1e3 / KIP, 39.7, 0.003);
    close(w.stretchDcr, 1.0, 1e-9);
  });
  it("concrete: 3 × 39.7 = 119 kips vs 0.75φNcbg 130 kips (pullout 53.9 kips)", () => {
    // SI breakout (ACI Eq. 17.6.2.2.3 in MPa) differs from the psi form by ~1 %.
    close(w.concreteDcr, 119 / 130, 0.03);
    expect(w.concreteDetail).toMatch(/pullout 176\.\d vs 23\d\.\d kN/);
  });
  it("tension-side plate for n Rt Treduced: tp 1.05 in (Eq. 4-62)", () => {
    close(w.tpTension / IN, 1.05, 0.01);
    expect(r.combos[0]!.tpRequired).toBe(w.tpTension);
  });
  it("design review rows", () => {
    const ids = basePlateDesignChecks(i, r).map((c) => c.id);
    for (const id of [
      "seismic-weak-scope",
      "seismic-weak-yield",
      "seismic-weak-thread",
      "seismic-weak-stretch",
      "seismic-weak-concrete",
      "seismic-weak-lug",
    ])
      expect(ids).toContain(id);
  });
  it("a weak base without a shear lug fails the lug row", () => {
    const j = ex641(false);
    const c = basePlateDesignChecks(j, analyzeBasePlate(j)).find(
      (x) => x.id === "seismic-weak-lug",
    )!;
    expect(c.dcr).toBe(Infinity);
  });
});
