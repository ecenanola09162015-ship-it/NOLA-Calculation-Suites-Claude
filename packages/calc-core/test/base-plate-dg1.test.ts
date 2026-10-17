/**
 * AISC Design Guide 1, 3rd Ed. (2024) worked examples as benchmarks for
 * engine base-plate-0.4.0. Expected values are DG1's printed results; the
 * tolerance (0.5 % – 2 %) covers DG1's rounding of intermediate values.
 * Inputs converted to SI: 1 in = 25.4 mm, 1 ksi = 6.894757 MPa,
 * 1 kip = 4.448222 kN, 1 kip-in = 0.112985 kN·m.
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBasePlate,
  basePlateDesignChecks,
  defaultBasePlateInput,
  type BasePlateInput,
  type BasePlateLoad,
} from "../src";

const IN = 25.4,
  KSI = 6.894757,
  KIP = 4.448222,
  KIPIN = 0.112985;
const close = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);
const load = (
  id: string,
  pu: number,
  mx = 0,
  vx = 0,
  my = 0,
): BasePlateLoad => ({
  id,
  pu: pu * KIP,
  mx: mx * KIPIN,
  my: my * KIPIN,
  vx: vx * KIP,
  vy: 0,
  seismic: false,
  included: true,
});
type W = { d: number; bf: number; tf: number; tw: number };
const W12X96: W = { d: 12.7, bf: 12.2, tf: 0.9, tw: 0.55 };
/**
 * DG1 example input: column (in), plate N (along d) × B, rods 2 × 2 at an
 * edge distance, A2/A1 = 1 (pedestal = plate) or large (√(A2/A1) = 2).
 */
function ex(o: {
  col: W;
  N: number;
  B: number;
  tp?: number;
  fc: number;
  edge?: number;
  sx?: number;
  sy?: number;
  confined: boolean;
  loads: BasePlateLoad[];
  method?: "LRFD" | "ASD";
}): BasePlateInput {
  const i = defaultBasePlateInput();
  i.designMethod = o.method ?? "LRFD";
  i.column = {
    ...i.column,
    designation: "DG1",
    d: o.col.d * IN,
    bf: o.col.bf * IN,
    tf: o.col.tf * IN,
    tw: o.col.tw * IN,
    fy: 50 * KSI,
  };
  i.plate = {
    bx: o.B * IN,
    by: o.N * IN,
    tp: (o.tp ?? 2) * IN,
    fy: 50 * KSI,
    fu: 65 * KSI,
  };
  const ped = o.confined ? 4 : 1;
  i.pedestal = {
    ...i.pedestal,
    px: o.B * IN * ped,
    py: o.N * IN * ped,
    height: 120 * IN,
    fc: o.fc * KSI,
    fcPsi: o.fc * 1000,
  };
  const e = (o.edge ?? 1.5) * IN;
  i.anchors = {
    ...i.anchors,
    nx: 2,
    ny: 2,
    sx: o.sx !== undefined ? o.sx * IN : o.B * IN - 2 * e,
    sy: o.sy !== undefined ? o.sy * IN : o.N * IN - 2 * e,
    hef: 24 * IN,
  };
  i.shear = { ...i.shear, method: "friction" };
  i.loads = o.loads;
  return i;
}
const combo = (i: BasePlateInput) => analyzeBasePlate(i).combos[0]!;

describe("DG1 Ex. 4.7-1 axial compression (W12×96, 22 × 20, f′c 3 ksi)", () => {
  it("tp,req 1.36 in", () => {
    const c = combo(
      ex({
        col: W12X96,
        N: 22,
        B: 20,
        fc: 3,
        confined: false,
        loads: [load("P", 700)],
      }),
    );
    expect(c.case).toBe("axial");
    close(c.tpRequired / IN, 1.36, 0.005);
  });
});

describe("DG1 Ex. 4.7-10 low moment (W12×96, 19 × 19, f′c 4 ksi)", () => {
  const base = { col: W12X96, N: 19, B: 19, fc: 4, edge: 2.5, confined: false };
  it("LRFD: Y 14.0 in, fp 1.41 ksi, tp 1.16 in", () => {
    const c = combo(ex({ ...base, loads: [load("L", 376, 940)] }));
    expect(c.case).toBe("small");
    close(c.axes[0]!.y / IN, 14.0, 0.005);
    close(c.fp / KSI, 1.41, 0.005);
    close(c.tpRequired / IN, 1.16, 0.005);
  });
  it("ASD: fp 0.977 ksi, tp 1.18 in", () => {
    const c = combo(
      ex({ ...base, method: "ASD", loads: [load("A", 260, 650)] }),
    );
    close(c.fp / KSI, 0.977, 0.005);
    close(c.tpRequired / IN, 1.18, 0.005);
  });
});

describe("DG1 Ex. 4.7-11 large moment (W12×96, 24 × 22, f = 9.25 in)", () => {
  const base = {
    col: W12X96,
    N: 24,
    B: 22,
    fc: 4,
    edge: 2.75,
    confined: false,
  };
  it("LRFD: Y 8.60 in, Tu ≈ 42 kips, tp 1.92 (bearing) / 0.755 in (tension, Eq. 4-62)", () => {
    const c = combo(ex({ ...base, loads: [load("L", 376, 3600)] }));
    const a = c.axes[0]!;
    expect(c.case).toBe("large");
    close(a.y / IN, 8.6, 0.01);
    close(a.tu / 1e3 / KIP, 42.0, 0.02);
    close(a.tpBearing / IN, 1.92, 0.005);
    close(a.tpTension / IN, 0.755, 0.015);
  });
  it("ASD: Y 9.10 in, tension interface 0.829 in", () => {
    const c = combo(
      ex({ ...base, method: "ASD", loads: [load("A", 260, 2500)] }),
    );
    close(c.axes[0]!.y / IN, 9.1, 0.01);
    close(c.axes[0]!.tpTension / IN, 0.829, 0.02);
  });
});

describe("DG1 Ex. 4.7-9 pure moment (W18×76, 28 × 12, f = 12 in)", () => {
  const W18X76: W = { d: 18.2, bf: 11.0, tf: 0.68, tw: 0.425 };
  const i = ex({
    col: W18X76,
    N: 28,
    B: 12,
    tp: 1.5,
    fc: 4,
    sx: 6,
    sy: 24,
    confined: true,
    loads: [load("M", 0, 1200)],
  });
  i.weld = { size: 0.25 * IN, fexx: 70 * KSI };
  it("Y 0.886 in, Tu 47.0 kips (Eq. 4-31/4-32)", () => {
    const c = combo(i);
    expect(c.case).toBe("large");
    close(c.axes[0]!.y / IN, 0.886, 0.005);
    close(c.axes[0]!.tu / 1e3 / KIP, 47.0, 0.005);
    close(Math.max(...c.rodTension) / 1e3 / KIP, 23.5, 0.005);
  });
  it("tp 1.31 in (compression governs) and 1.06 in (tension)", () => {
    const c = combo(i);
    close(c.axes[0]!.tpBearing / IN, 1.31, 0.005);
    close(c.axes[0]!.tpTension / IN, 1.06, 0.005);
    close(c.tpRequired / IN, 1.31, 0.005);
  });
  it("flange weld: Ru = M/d = 65.9 kips vs φRn 92.3 kips (kds 1.5)", () => {
    const c = combo(i);
    close(c.weld.dcr, 65.9 / 92.3, 0.01);
  });
});

describe("DG1 Ex. 4.7-12 / 4.7-13 tension with moment (W12×96, 19 × 19, f = 8 in)", () => {
  const base = { col: W12X96, N: 19, B: 19, fc: 4, confined: false };
  it("4.7-12 e > f: Y 0.274 in (DG1 prints 0.300 after rounding the root to 17.2), Tu 111.5 ≈ 113 kips", () => {
    const c = combo(ex({ ...base, loads: [load("T", -100, 1000)] }));
    expect(c.case).toBe("large");
    // Exact: 17.5 − √(306.25 − 9.52) = 0.274 in.
    close(c.axes[0]!.y / IN, 0.2742, 0.005);
    close(c.axes[0]!.tu / 1e3 / KIP, 113, 0.015);
  });
  it("4.7-13 e ≤ f: rods 28.1 / 21.9 kips, no bearing (Eq. 4-67)", () => {
    const c = combo(ex({ ...base, loads: [load("T", -100, 100)] }));
    expect(c.case).toBe("uplift");
    const t = c.rodTension.map((v) => v / 1e3 / KIP).sort((a, b) => a - b);
    close(t[0]!, 21.875, 0.001);
    close(t[3]!, 28.125, 0.001);
  });
});

describe("DG1 Ex. 4.7-14 biaxial (W8×48, 14 × 14, Eq. 4-69)", () => {
  const W8X48: W = { d: 8.5, bf: 8.11, tf: 0.685, tw: 0.4 };
  const i = ex({
    col: W8X48,
    N: 14,
    B: 14,
    tp: 1.75,
    fc: 4,
    confined: true,
    loads: [load("B", 90, 700, 0, 450)],
  });
  // 5/8 in F1554 Gr 55: Ase 0.226 in², Fu 75 ksi (φNsa 12.7 kips).
  i.anchors = {
    ...i.anchors,
    da: 0.625 * IN,
    ase: 0.226 * IN * IN,
    fy: 55 * KSI,
    fu: 75 * KSI,
    hef: 16 * IN,
  };
  i.pedestal = { ...i.pedestal, px: 100 * IN, py: 100 * IN };
  it("Mcx = Mcy = 837 kip-in and interaction 0.988", () => {
    const c = combo(i);
    expect(c.biaxial).not.toBeNull();
    close(c.biaxial!.mcx / KIPIN, 837, 0.01);
    close(c.biaxial!.mcy / KIPIN, 837, 0.01);
    close(c.biaxial!.ratio, 0.988, 0.01);
    const chk = basePlateDesignChecks(i, analyzeBasePlate(i)).find(
      (x) => x.id === "biaxial",
    )!;
    close(chk.dcr!, 0.988, 0.01);
  });
  it("strong axis at the applied loads: Y 1.65 in exact (DG1 prints 1.70 after rounding the root to 10.8)", () => {
    const c = combo(i);
    const a = c.axes.find((x) => x.axis === "y")!;
    // 12.5 − √(156.25 − 2 × 90 × 13.28 / 61.9) = 1.654 in.
    close(a.y / IN, 1.654, 0.01);
    expect(c.method).toContain("Eq. 4-69");
  });
});

const W10X45: W = { d: 10.1, bf: 8.02, tf: 0.62, tw: 0.35 };
describe("DG1 Ex. 4.7-3 concentric tension, rods between the flanges (W10×45)", () => {
  const i = ex({
    col: W10X45,
    N: 14,
    B: 14,
    tp: 1,
    fc: 4,
    sx: 4,
    sy: 4,
    confined: true,
    loads: [load("T", -70)],
  });
  i.anchors = { ...i.anchors, da: 0.875 * IN, ase: 0.462 * IN * IN };
  i.weld = { size: (3 / 16) * IN, fexx: 70 * KSI };
  it("plate about the web: a 1.83 in, beff 3.66 in, tp 0.882 in", () => {
    const c = combo(i);
    const g = c.plateTension.find((x) => x.support.startsWith("web"))!;
    close(g.levers[0]! / IN, 1.825, 0.002);
    close(g.beff / IN, 3.65, 0.002);
    close(c.tpRequired / IN, 0.882, 0.005);
  });
  it("web weld 4.78 vs 6.26 kip/in (kds 1.5)", () => {
    close(combo(i).weld.dcr, 4.78 / 6.26, 0.01);
  });
});

describe("DG1 Ex. 4.7-6 rods in tension, shear and bending (AISC J3.8)", () => {
  const mk = (da: number) => {
    const i = ex({
      col: W10X45,
      N: 20,
      B: 20,
      tp: 1,
      fc: 4,
      sx: 16,
      sy: 16,
      confined: true,
      loads: [load("TV", -73.2, 0, 38)],
    });
    i.shear = { ...i.shear, method: "anchors" };
    i.anchors = {
      ...i.anchors,
      da: da * IN,
      ase: 1 * IN * IN,
      fu: 58 * KSI,
      fy: 36 * KSI,
      weldedWashers: true,
      washer: { size: 4 * IN, thickness: 0.375 * IN },
    };
    return combo(i).rodAisc;
  };
  it("1½ in rods: ft 20.3 ksi ≤ φF′nt 32.6 ksi", () => {
    const r = mk(1.5);
    close(r.lever / IN, 0.594, 0.002);
    close(r.ft / KSI, 20.3, 0.005);
    close(r.ftAllow / KSI, 32.6, 0.005);
  });
  it("1⅛ in rods fail: ft 42.2 ksi > φF′nt 26.5 ksi", () => {
    const r = mk(1.125);
    close(r.ft / KSI, 42.2, 0.005);
    close(r.ftAllow / KSI, 26.5, 0.005);
    expect(r.dcr).toBeGreaterThan(1.5);
  });
});

describe("DG1 Ex. 4.7-5 shear lug (W14×90, 15 × 15 × 1, 8 × 1 × 2 in lug)", () => {
  const i = ex({
    col: { d: 14.0, bf: 14.5, tf: 0.71, tw: 0.44 },
    N: 15,
    B: 15,
    tp: 1,
    fc: 4,
    sx: 8.5,
    sy: 8.5,
    confined: true,
    loads: [load("V", 0, 0, 25)],
  });
  i.pedestal = { ...i.pedestal, px: 30 * IN, py: 200 * IN, height: 100 * IN };
  i.grout = { thickness: 2 * IN };
  i.anchors = {
    ...i.anchors,
    da: 0.75 * IN,
    ase: 0.334 * IN * IN,
    hef: 12 * IN,
  };
  i.weld = { size: 0.25 * IN, fexx: 70 * KSI };
  i.shear = {
    ...i.shear,
    method: "lug",
    lug: {
      orientation: "x",
      width: 8 * IN,
      thickness: 1 * IN,
      depth: 2 * IN,
      fy: 50 * KSI,
      fu: 65 * KSI,
      weld: (5 / 16) * IN,
    },
  };
  const c = combo(i);
  it("lug moment 75 kip-in → Y 0.0967 in, Tu 6.41 kips", () => {
    close(c.lugMoment!.my / KIPIN, 75, 0.002);
    const a = c.axes.find((x) => x.axis === "x")!;
    close(a.y / IN, 0.0967, 0.01);
    close(a.tu / 1e3 / KIP, 6.41, 0.01);
  });
  it("φVbrg 70.9 kips, φVcb 26.1 kips (φ 0.65; SI Vb = 3.7√f′c ca1^1.5 is 1.7 % below 9√f′c)", () => {
    close(c.lug!.phiVbrg / 1e3 / KIP, 70.9, 0.005);
    close(c.lug!.phiVcb / 1e3 / KIP, 26.1, 0.025);
  });
  it("Eq. 9-1 0.833, weld 7.91 vs 10.4 kip/in, plate 47.8 vs 90.0 kip-in", () => {
    close(c.lug!.interaction, 0.833, 0.005);
    close(c.lug!.weldF / (KIP / IN) / 1e3, 7.91, 0.01);
    close(c.lug!.weldCap / (KIP / IN) / 1e3, 10.4, 0.01);
    close(c.lug!.plateM / 1e3 / (KIP * IN), 47.8, 0.01);
    close(c.lug!.plateMn / 1e3 / (KIP * IN), 90.0, 0.005);
  });
});

describe("friction and ASD anchor basis", () => {
  it("friction φ0.65 μP capped at 0.75 min(0.2f′c, 5.5 MPa)·Ac (DG1 Eq. 4-30)", () => {
    const i = defaultBasePlateInput();
    i.shear = { ...i.shear, method: "friction", mu: 0.4 };
    i.loads = [{ ...i.loads[0]! }];
    const c = combo(i);
    expect(c.friction!.capacity).toBeCloseTo(0.65 * 0.4 * 900e3, 3);
    expect(c.friction!.cap).toBeCloseTo(0.75 * 5.5 * 450 * 500, 3);
  });
  it("friction-anchors: the rods take the rest of the shear", () => {
    const i = defaultBasePlateInput();
    i.shear = { ...i.shear, method: "friction-anchors", mu: 0.4 };
    i.loads = [{ ...i.loads[1]!, vx: 150, vy: 0 }];
    const c = combo(i);
    const rest = 150e3 - c.friction!.share;
    expect(c.anchor.vuaMax).toBeCloseTo(rest / c.shearRods.length, 3);
  });
  it("ASD with an LRFD table: ACI rows come from the LRFD run", () => {
    const i = defaultBasePlateInput();
    i.designMethod = "ASD";
    i.asdAnchorBasis = "lrfd";
    i.lrfdLoads = i.loads.map((l) => ({
      ...l,
      id: `U${l.id}`,
      pu: l.pu * 1.4,
    }));
    const r = analyzeBasePlate(i);
    expect(r.anchorRun).not.toBeNull();
    const checks = basePlateDesignChecks(i, r);
    const bt = checks.find((c) => c.id === "breakout-tension")!;
    expect(bt.label).toContain("LRFD Combinations");
    expect(bt.detail).toMatch(/^U/);
    expect(checks.find((c) => c.id === "plate")!.detail).not.toMatch(/^U/);
  });
  it("ASD with LRFD basis needs LRFD combinations", () => {
    const i = defaultBasePlateInput();
    i.designMethod = "ASD";
    i.asdAnchorBasis = "lrfd";
    expect(() => analyzeBasePlate(i)).toThrow(/LRFD combinations/);
  });
});

describe("DG1 Ex. 4.7-6 plate washer bearing (AISC J3.11)", () => {
  it("1½ in rod, ⅜ in A572 Gr 50 washer 4 in: φRn = min(82.5, 32.6) kips vs 9.50 kips", () => {
    const i = defaultBasePlateInput();
    i.plate = { ...i.plate, fy: 50 * KSI, fu: 65 * KSI };
    i.shear = { ...i.shear, method: "anchors" };
    i.anchors = {
      ...i.anchors,
      da: 1.5 * IN,
      weldedWashers: true,
      washer: { size: 4 * IN, thickness: 0.375 * IN },
    };
    i.loads = [
      {
        id: "V",
        pu: 100,
        mx: 0,
        my: 0,
        vx: 38 * KIP,
        vy: 0,
        seismic: false,
        included: true,
      },
    ];
    const h = analyzeBasePlate(i).combos[0]!.holeBearing!;
    close(h.lc / IN, 1.1875, 1e-6);
    close(h.bearing / 1e3 / KIP, 82.5, 0.005);
    close(h.tearout / 1e3 / KIP, 32.6, 0.005);
    close(h.v / 1e3 / KIP, 9.5, 1e-6);
    close(h.dcr, 9.5 / 32.6, 0.005);
  });
  it("no rod shear (friction or lug): no bearing check", () => {
    const i = defaultBasePlateInput();
    i.shear = { ...i.shear, method: "lug" };
    expect(analyzeBasePlate(i).combos[0]!.holeBearing).toBeNull();
  });
});
