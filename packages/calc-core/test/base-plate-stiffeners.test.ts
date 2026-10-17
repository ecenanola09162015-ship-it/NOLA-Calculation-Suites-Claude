/**
 * Stiffened base plate benchmarks (engine base-plate-0.3.0).
 * Expected values: tools/benchmarks/base_plate_stiffener_reference.py
 * (independent Python: numerical yield-line integration, closed-form strip
 * loads, AISC 360-22 F11 / J4.2 / J2.4 / J10) and AISC Design Guide 1,
 * 3rd Ed., Example 4.7-7 (rod beside a stiffener: a = (s − t)/2, be = 2a,
 * weld kds = 1.5).
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBasePlate,
  basePlateDesignChecks,
  basePlateDraftSchema,
  basePlateInputSchema,
  basePlateStiffening,
  defaultBasePlateInput,
  stiffenerLayoutsFor,
  stripPanel,
  yieldLinePanel,
  type BasePlateInput,
} from "../src";

const close = (a: number, b: number, tol = 0.002) =>
  expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);
const full = (a: number, b: number) => ({ x0: 0, x1: b, y0: 0, y1: a });

describe("yield-line and strip panels (Python reference)", () => {
  it("full uniform load coefficients / a²", () => {
    close(
      yieldLinePanel("P3", 100, 100, full(100, 100)).coefficient / 1e4,
      0.03536,
    );
    close(
      yieldLinePanel("P3", 100, 200, full(100, 200)).coefficient / 1e4,
      0.08531,
    );
    close(
      yieldLinePanel("P2", 100, 100, full(100, 100)).coefficient / 1e4,
      0.08531,
    );
    close(
      yieldLinePanel("P2", 100, 200, full(100, 200)).coefficient / 1e4,
      0.16667,
    );
  });
  it("tends to the cantilever and the fixed strip", () => {
    close(
      yieldLinePanel("P3", 100, 2000, full(100, 2000)).coefficient / 1e4,
      0.3731,
      0.005,
    );
    close(
      yieldLinePanel("P3", 2000, 100, full(2000, 100)).coefficient,
      607.2,
      0.005,
    );
  });
  it("partial bearing block (outer 40 mm of a 100 × 200 P3)", () => {
    close(
      yieldLinePanel("P3", 100, 200, { x0: 0, x1: 200, y0: 60, y1: 100 })
        .coefficient,
      502.66,
      0.005,
    );
  });
  it("strip method is the 45° cantilever L²/2", () => {
    expect(stripPanel("P3", 100, 100, full(100, 100)).coefficient).toBeCloseTo(
      1250,
      6,
    );
    expect(stripPanel("P2", 100, 200, full(100, 200)).coefficient).toBeCloseTo(
      5000,
      6,
    );
    expect(stripPanel("P2", 100, 50, full(100, 50)).coefficient).toBeCloseTo(
      1250,
      6,
    );
  });
});

const withLayout = (
  layout: BasePlateInput["stiffeners"]["layout"],
  patch: Partial<BasePlateInput["stiffeners"]> = {},
) => {
  const i = defaultBasePlateInput();
  i.stiffeners = { ...i.stiffeners, layout, ...patch };
  return i;
};
const check = (i: BasePlateInput, id: string) => {
  const c = basePlateDesignChecks(i, analyzeBasePlate(i)).find(
    (x) => x.id === id,
  );
  if (!c) throw new Error(`no check ${id}`);
  return c;
};

describe("W12X40 default, LC1 axial (Python reference)", () => {
  it("web-side: n-zone P2 panel and stiffener S1", () => {
    const i = withLayout("web-side");
    i.loads = [i.loads[0]!];
    const r = analyzeBasePlate(i);
    const c = r.combos[0]!;
    const panel = c.stiffener!.panels.find((p) => p.zone === "+x")!;
    close(panel.a, 143.618, 1e-4);
    expect(panel.b).toBeCloseTo(242, 6);
    close(panel.mReq, 13100.2, 0.003);
    close(panel.tpReq, 15.322, 0.002);
    const s1 = c.stiffener!.members.find((m) => m.group === "web-side")!;
    close(s1.vRoot, 91697, 0.003);
    close(s1.mRoot, 15.6784e6, 0.003);
    close(s1.flexure.dcr, 0.2913, 0.004);
    close(s1.shear.dcr, 0.2046, 0.006);
    close(s1.weldColumn.dcr, 0.7427, 0.003);
  });
  it("web-line: stiffener and column web J10.2 / J10.3", () => {
    const i = withLayout("web-line");
    i.loads = [i.loads[0]!];
    const s1 = analyzeBasePlate(i).combos[0]!.stiffener!.members[0]!;
    close(s1.vRoot, 51406, 0.003);
    close(s1.mRoot, 3.1856e6, 0.003);
    close(s1.flexure.dcr, 0.0576, 0.006);
    close(s1.weldColumn.dcr, 0.1731, 0.004);
    close(s1.column!.h, 20775, 0.004);
    close(s1.column!.phiRnWly, 381820, 0.001);
    close(s1.column!.phiRnWcr, 290800, 0.001);
    close(s1.column!.dcr, 0.0714, 0.005);
  });
  it("never needs more plate than the unstiffened design", () => {
    const base = analyzeBasePlate(defaultBasePlateInput());
    for (const layout of stiffenerLayoutsFor("I")) {
      const r = analyzeBasePlate(withLayout(layout));
      r.combos.forEach((c, k) =>
        expect(c.tpRequired).toBeLessThanOrEqual(
          base.combos[k]!.tpRequired + 1e-9,
        ),
      );
    }
  });
  it("cross stiffening removes the DG1 cantilevers (λn′ remains)", () => {
    const r = analyzeBasePlate(withLayout("web-line+web-side"));
    const lc1 = r.combos[0]!;
    expect(lc1.stiffener!.unstiffenedTp).toBeGreaterThan(0); // λn′ only
    expect(lc1.tpRequired).toBeLessThan(
      analyzeBasePlate(defaultBasePlateInput()).combos[0]!.tpRequired,
    );
  });
});

// AISC DG1 3rd Ed. Example 4.7-7 (W21×83, rods 3¼ in each side of a ½ in
// stiffener in the web plane, Nua = 17.3 kips per rod, 1¾ in Gr 50 plate).
const IN = 25.4,
  KIP = 4448.222;
function dg1Ex477(): BasePlateInput {
  const i = defaultBasePlateInput();
  i.column = {
    ...i.column,
    designation: "W21X83",
    d: 21.4 * IN,
    bf: 8.36 * IN,
    tf: 0.835 * IN,
    tw: 0.515 * IN,
    fy: 344.74,
  };
  i.plate = { bx: 14 * IN, by: 34 * IN, tp: 1.75 * IN, fy: 344.74 };
  i.pedestal = { ...i.pedestal, px: 40 * IN, py: 60 * IN, height: 40 * IN };
  i.anchors = {
    ...i.anchors,
    nx: 2,
    ny: 2,
    sx: 6.5 * IN,
    sy: 28 * IN,
    hef: 24 * IN,
  };
  i.weld = { size: 0.25 * IN, fexx: 482.63 };
  i.stiffeners = {
    ...i.stiffeners,
    layout: "web-line",
    t: 0.5 * IN,
    hc: 12 * IN,
    he: 6 * IN,
    clip: 0,
    fy: 344.74,
    weldPlate: 0.25 * IN,
  };
  i.loads = [
    {
      id: "4.7-7",
      pu: (-4 * 17.3 * KIP) / 1e3,
      mx: 0,
      my: 0,
      vx: 0,
      vy: 0,
      seismic: false,
      included: true,
    },
  ];
  return i;
}
describe("AISC DG1 3rd Ed. Example 4.7-7", () => {
  it("rod beside the stiffener: a 3.00 in, be 6.00 in, Mr 51.9 kip-in", () => {
    const c = analyzeBasePlate(dg1Ex477()).combos[0]!;
    const g = c.stiffener!.tension.find((x) => x.support !== "column")!;
    close(g.levers[0]! / IN, 3.0, 1e-6);
    close(g.beff / IN, 6.0, 1e-6);
    close((g.m * g.beff) / (KIP * IN), 51.9, 1e-3);
    // tp,req = 1.75 √(51.9 / 207): DG1 φMn 207 kip-in for 1¾ in.
    close(c.tpRequired / IN, 0.8769, 1e-3);
  });
  it("stiffener-to-plate weld: φRn 50.1 kips per rod (401 / 8), DCR 0.345", () => {
    const i = dg1Ex477();
    const w = check(i, "stiffener-weld-plate");
    close(w.dcr!, 0.3452, 2e-3);
  });
});

describe("inputs, drafts and geometry", () => {
  it("old drafts open unstiffened", () => {
    const { stiffeners: _s, ...old } = defaultBasePlateInput();
    void _s;
    const d = basePlateDraftSchema.parse({
      kind: "base-plate",
      version: 1,
      input: old,
    });
    expect(d.input.stiffeners.layout).toBe("none");
  });
  it("rejects a layout that does not suit the column family", () => {
    const i = withLayout("hss-mid");
    expect(basePlateInputSchema.safeParse(i).success).toBe(false);
  });
  it("rejects he > hc", () => {
    const i = withLayout("web-line", { he: 300 });
    expect(basePlateInputSchema.safeParse(i).success).toBe(false);
  });
  it("lays out stiffeners for each family", () => {
    expect(basePlateStiffening(withLayout("flange-tip"))!.plates).toHaveLength(
      4,
    );
    expect(
      basePlateStiffening(withLayout("web-line+web-side"))!.plates,
    ).toHaveLength(4);
    const rot = withLayout("web-line");
    rot.rotation = 90;
    const p = basePlateStiffening(rot)!.plates;
    expect(p.every((s) => s.axis === "x")).toBe(true);
    expect(stiffenerLayoutsFor("HSS-RECT")).toEqual(["none", "hss-mid"]);
    expect(stiffenerLayoutsFor("HSS-ROUND")).toEqual(["none", "radial-4"]);
  });
  it("flags a rod washer on top of a stiffener", () => {
    const i = withLayout("web-line");
    i.anchors = { ...i.anchors, sx: 60 };
    expect(check(i, "geo-stiffener-clear").dcr!).toBeGreaterThan(1);
  });
  it("strip option is never below the yield-line requirement here", () => {
    const yl = analyzeBasePlate(withLayout("web-side"));
    const sm = analyzeBasePlate(
      withLayout("web-side", { plateMethod: "strip" }),
    );
    yl.combos.forEach((c, k) =>
      expect(sm.combos[k]!.tpRequired).toBeGreaterThanOrEqual(
        c.tpRequired - 1e-9,
      ),
    );
  });
});
