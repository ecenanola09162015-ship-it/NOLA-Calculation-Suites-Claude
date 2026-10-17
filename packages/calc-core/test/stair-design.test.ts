/**
 * Stairs engine hand-calculation tests (decision sheet 'Benchmarks' B1–B10).
 * Reference case (B10) = the uploaded ACI_318_19_Concrete_Stair_Design_Improved.xlsx
 * corrected per sheet 'Ref Recalc': R 175, T 275, t 150, γc 24, finishes 1 kPa,
 * LL 5 kPa, f′c 28, fy 420, cover 20, Ø12 @ 200.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeStairs,
  defaultStairsInput,
  solveFrame,
  stairDevelopmentLength,
  stairEffectiveWidth,
  stairFlightDeadLoad,
  stairGeometry,
  stairHookLength,
  stairMinimumThickness,
  stairOneWayShear,
  stairPitch,
  stairsDesignChecks,
  stairsDraftSchema,
  stairsInputSchema,
  type StairsInput,
} from "../src";

const ref = (): StairsInput => ({
  ...defaultStairsInput(),
  riser: 175,
  going: 275,
  waist: 150,
  finishes: 1,
  soffitFinish: 0,
  live: 5,
  bottomLanding: { length: 0, thickness: 150, width: 0 },
  topLanding: { length: 0, thickness: 150, width: 0 },
  flights: [{ risers: 10, landingAfter: null }],
  bottomSupport: { ...defaultStairsInput().bottomSupport, condition: "Pinned" },
  topSupport: { condition: "Sliding", bearing: 250 },
  bars: {
    ...defaultStairsInput().bars,
    mainBottom: { diameter: 12, spacing: 200 },
  },
  combinations: [
    { id: "LC1", deadFactor: 1.2, liveFactor: 1.6, included: true },
  ],
});
const check = (r: ReturnType<typeof analyzeStairs>, id: string) => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`missing check ${id}`);
  return c;
};
const maxPos = (r: ReturnType<typeof analyzeStairs>, k = 0) =>
  Math.max(...r.strips[k].stations.map((s) => s.mPos));
const minNeg = (r: ReturnType<typeof analyzeStairs>, k = 0) =>
  Math.min(...r.strips[k].stations.map((s) => s.mNeg));

describe("stairs: geometry and loads (G2, L1, B5)", () => {
  it("pitch θ = atan(R/T), not N·R/(Nt·T) (reference R1)", () => {
    expect(stairPitch(175, 275).degrees).toBeCloseTo(32.4712, 4);
  });
  it("self-weight on plan includes the steps (reference R2)", () => {
    const w = stairFlightDeadLoad({
      unitWeight: 24,
      waist: 150,
      riser: 175,
      going: 275,
      finishes: 1,
      soffitFinish: 0,
    });
    expect(w.waist).toBeCloseTo(4.2671, 4);
    expect(w.steps).toBeCloseTo(2.1, 6);
    expect(w.total).toBeCloseTo(7.3671, 4);
  });
  it("knee and support positions follow the soffit geometry", () => {
    const i: StairsInput = {
      ...ref(),
      bottomLanding: { length: 1000, thickness: 200, width: 0 },
      topLanding: { length: 1500, thickness: 150, width: 0 },
    };
    const [g] = stairGeometry(i);
    const { cos, tan } = stairPitch(175, 275);
    // lower knee: xa + (t/(2cosθ) − tL/2)/tanθ
    expect(g.knees[0].x).toBeCloseTo(1000 + (150 / (2 * cos) - 100) / tan, 6);
    expect(g.knees[0].y).toBeCloseTo(-100, 6);
    // upper knee: xa + nT + (t/(2cosθ) − tL/2)/tanθ at level nR − tL/2
    expect(g.knees[1].x).toBeCloseTo(
      1000 + 10 * 275 + (150 / (2 * cos) - 75) / tan,
      6,
    );
    expect(g.knees[1].y).toBeCloseTo(1750 - 75, 6);
    expect(g.length).toBeCloseTo(1000 + 9 * 275 + 1500, 6);
    expect(g.supports.map((s) => s.x)).toEqual([0, g.length]);
  });
  it("rejects a top landing shorter than one going + knee offset", () => {
    const r = analyzeStairs({
      ...ref(),
      topLanding: { length: 200, thickness: 150, width: 0 },
    });
    expect(r.error).toMatch(/Top landing/);
  });
  it("rejects an intermediate landing shorter than one going", () => {
    const r = analyzeStairs({
      ...ref(),
      flights: [
        {
          risers: 6,
          landingAfter: {
            length: 250,
            thickness: 150,
            width: 0,
            startSupport: "None",
            endSupport: "None",
          },
        },
        { risers: 6, landingAfter: null },
      ],
    });
    expect(r.error).toMatch(/Landing 1/);
  });
});

describe("stairs: analysis (B1, B2, B3, B4a)", () => {
  it("B1 pinned–sliding straight flight: Mu = wu·L²/8 on plan, R = wu·L/2", () => {
    const r = analyzeStairs(ref());
    expect(r.error).toBeNull();
    const L = 10 * 0.275; // waist bears one going beyond the last riser line
    const wu = 1.2 * 7.3671 + 1.6 * 5;
    expect(maxPos(r)).toBeCloseTo((wu * L * L) / 8, 2);
    const bottom = r.strips[0].reactions[0];
    expect(bottom.factored.vMax).toBeCloseTo((wu * L) / 2, 2);
    expect(bottom.dead.h).toBeCloseTo(0, 6);
  });
  it("B1 flexure DCR uses φMn = φAs fy (d − a/2) (B6)", () => {
    const r = analyzeStairs(ref());
    const a = (565.4867 * 420) / (0.85 * 28 * 1000);
    const phiMn = (0.9 * 565.4867 * 420 * (124 - a / 2)) / 1e6;
    expect(phiMn).toBeCloseTo(25.439, 3);
    const L = 2.75,
      wu = 1.2 * 7.3671 + 1.6 * 5;
    expect(check(r, "s1:flight-1:flexure-pos").dcr!).toBeCloseTo(
      (wu * L * L) / 8 / phiMn,
      2,
    );
  });
  it("B2 fixed–fixed straight flight: support −wL²/12, midspan +wL²/24", () => {
    const r = analyzeStairs({
      ...ref(),
      bottomSupport: { ...ref().bottomSupport, condition: "Fixed" },
      topSupport: { condition: "Fixed", bearing: 250 },
    });
    const L = 2.75,
      wu = 1.2 * 7.3671 + 1.6 * 5;
    expect(minNeg(r)).toBeCloseTo((-wu * L * L) / 12, 1);
    expect(maxPos(r)).toBeCloseTo((wu * L * L) / 24, 1);
  });
  it("B3 landing + flight: pinned–pinned envelope ≥ pinned–sliding for +M (thrust envelope)", () => {
    const base = {
      ...ref(),
      topLanding: { length: 1200, thickness: 150, width: 0 },
    };
    const sliding = analyzeStairs(base);
    const pinned = analyzeStairs({
      ...base,
      topSupport: { condition: "Pinned", bearing: 250 },
    });
    expect(maxPos(pinned)).toBeGreaterThanOrEqual(maxPos(sliding) - 1e-6);
    expect(pinned.notes.some((n) => /thrust/.test(n))).toBe(true);
    // statics of the released model: reactions sum to the total factored load
    const w = sliding.strips[0].reactions.reduce(
      (s, r) => s + r.factored.vMax,
      0,
    );
    const g = sliding.strips[0].geometry;
    const wuF = 1.2 * 7.3671 + 1.6 * 5,
      wuL = 1.2 * (3.6 + 1) + 1.6 * 5;
    const flight = 9 * 275,
      landing = g.length - flight;
    expect(g.regions.map((r) => r.x1 - r.x0)).toEqual([flight, 1200]);
    expect(w).toBeCloseTo((wuF * flight + wuL * landing) / 1000, 2);
  });
  it("B4a point load P at x on a pinned–sliding flight: ΔR = P(L − x)/L", () => {
    const P = 10,
      x = 1000;
    const a = analyzeStairs(ref());
    const b = analyzeStairs({
      ...ref(),
      localLoads: [
        {
          kind: "point",
          id: "P1",
          strip: 1,
          case: "dead",
          x,
          value: P,
          width: 300,
        },
      ],
    });
    const L = 2750;
    expect(
      b.strips[0].reactions[0].dead.v - a.strips[0].reactions[0].dead.v,
    ).toBeCloseTo((P * (L - x)) / L, 4);
  });
  it("B4a full-width mode spreads P over be (L5a)", () => {
    const P = 10,
      x = 1000;
    const base = { ...ref(), widthMode: "full" as const, flightWidth: 3000 };
    const a = analyzeStairs(base);
    const b = analyzeStairs({
      ...base,
      localLoads: [
        {
          kind: "point",
          id: "P1",
          strip: 1,
          case: "dead",
          x,
          value: P,
          width: 300,
        },
      ],
    });
    const L = 2750;
    const be = stairEffectiveWidth(300, 3000, { kind: "span", x, length: L });
    expect(be).toBeCloseTo(300 + 2.4 * x * (1 - x / L), 6);
    expect(
      b.strips[0].reactions[0].dead.v - a.strips[0].reactions[0].dead.v,
    ).toBeCloseTo(((P * 1000) / be) * ((L - x) / L), 4);
    expect(b.strips[0].reactions[0].widthM).toBe(3);
  });
  it("flags an unstable layout (both ends Sliding)", () => {
    const r = analyzeStairs({
      ...ref(),
      bottomSupport: { ...ref().bottomSupport, condition: "Sliding" },
    });
    expect(r.error).toMatch(/unstable/);
    expect(r.checks).toHaveLength(0);
  });
  it("warns on uplift at a pinned top support beyond a landing", () => {
    const r = analyzeStairs({
      ...ref(),
      topLanding: { length: 1200, thickness: 150, width: 0 },
      topSupport: { condition: "Pinned", bearing: 250 },
    });
    expect(r.warnings.some((w) => /uplift/.test(w))).toBe(true);
  });
});

describe("stairs: section checks (B7, B8, B9, minimum thickness)", () => {
  it("B7 φVc, Table 22.5.5.1(c) with λs and ρw (reference R5: 71.8 not 111.5 kN/m)", () => {
    const v = stairOneWayShear(28, 565.4867, 124, 150);
    const vc = 0.66 * 1 * Math.cbrt(565.4867 / 124000) * Math.sqrt(28) * 124;
    expect(v.lambdaS).toBe(1);
    expect(v.vc).toBeCloseTo(vc, 6);
    expect(v.vc).toBeCloseTo(71.81, 2);
    expect(v.phiVc).toBeCloseTo(0.75 * vc, 6);
  });
  it("B7 axial tension reduces Vc (22.5.5.1(c) Nu/6Ag)", () => {
    const a = stairOneWayShear(28, 565.4867, 124, 150);
    const b = stairOneWayShear(28, 565.4867, 124, 150, -30);
    expect(a.vc - b.vc).toBeCloseTo(((30 * 1000) / (6 * 1000 * 150)) * 124, 6);
  });
  it("B8 ld per 25.4.2.4 and ldh per 25.4.3.1(a) (reference R6)", () => {
    const ld = stairDevelopmentLength(
      { fc: 28, fy: 420 },
      { diameter: 12, spacing: 200 },
      20,
    );
    expect(ld).toBeCloseTo(
      ((420 * 0.8) / (1.1 * Math.sqrt(28) * (26 / 12))) * 12,
      6,
    );
    expect(
      stairDevelopmentLength(
        { fc: 28, fy: 420 },
        { diameter: 10, spacing: 400 },
        20,
      ),
    ).toBe(300);
    const ldh = stairHookLength({ fc: 28, fy: 420 }, 12);
    expect(ldh).toBeCloseTo(
      ((420 * 1.6 * 1.25 * (28 / 105 + 0.6)) / (23 * Math.sqrt(28))) *
        12 ** 1.5,
      6,
    );
  });
  it("B9 immediate gross deflection 5wL⁴/384EI in mm (reference R7 unit error)", () => {
    const w = 7.3671 + 5,
      L = 2.625,
      ec = 4700 * Math.sqrt(28) * 1000,
      I = 0.15 ** 3 / 12;
    const n = 10;
    const nodes = Array.from({ length: n + 1 }, (_, k) => ({
      x: (L * k) / n,
      y: 0,
    }));
    const members = nodes
      .slice(1)
      .map((_, k) => ({ i: k, j: k + 1, ei: ec * I, ea: ec * 0.15, q: w }));
    const [r] = solveFrame({
      nodes,
      members,
      restraints: [
        { node: 0, ux: true, uy: true, rz: false },
        { node: n, ux: false, uy: true, rz: false },
      ],
    });
    expect(-r.displacements[5].uy * 1000).toBeCloseTo(1.0931, 3);
  });
  it("minimum thickness Table 7.3.1.1 with fy factor", () => {
    expect(stairMinimumThickness(4000, 0, 420).hmin).toBeCloseTo(200, 6);
    expect(stairMinimumThickness(4000, 1, 420).hmin).toBeCloseTo(4000 / 24, 6);
    expect(stairMinimumThickness(4000, 2, 280).hmin).toBeCloseTo(
      (4000 / 28) * 0.8,
      6,
    );
    expect(stairMinimumThickness(1500, "cantilever", 420).hmin).toBeCloseTo(
      150,
      6,
    );
  });
  it("reference case: thickness screen uses the developed length (C5)", () => {
    const r = analyzeStairs(ref());
    const span = r.strips[0].spans[0];
    expect(span.developed).toBeCloseTo(2750 / stairPitch(175, 275).cos, 0);
    expect(span.hmin).toBeCloseTo(span.developed / 20, 6);
  });
  it("crack-control and spacing limits", () => {
    const r = analyzeStairs(ref());
    expect(check(r, "bars:mainBottom:crack").dcr).toBeCloseTo(200 / 300, 6);
    expect(check(r, "bars:mainBottom:spacing").dcr).toBeCloseTo(200 / 450, 6);
    expect(check(r, "bars:mainBottom:minimum").dcr).toBeCloseTo(
      (0.0018 * 1000 * 150) / 565.4867,
      4,
    );
  });
});

describe("stairs: dog-leg and ground footing (G1b, G5, B4c)", () => {
  const dog = (): StairsInput => ({
    ...ref(),
    stairType: "dog-leg",
    flights: [
      {
        risers: 9,
        landingAfter: {
          length: 1300,
          thickness: 150,
          width: 0,
          startSupport: "None",
          endSupport: "Pinned",
        },
      },
      { risers: 9, landingAfter: null },
    ],
  });
  it("dog-leg: two strips share the mid-landing support", () => {
    const r = analyzeStairs(dog());
    expect(r.error).toBeNull();
    expect(r.strips).toHaveLength(2);
    expect(r.strips[1].geometry.baseLevel).toBe(9 * 175);
    expect(r.strips[0].geometry.supports.at(-1)!.role).toBe("mid");
    expect(r.strips[1].geometry.supports[0].role).toBe("mid");
    expect(r.checks.some((c) => c.id.startsWith("s2:"))).toBe(true);
  });
  it("dog-leg requires exactly two flights with a mid landing", () => {
    expect(
      stairsInputSchema.safeParse({
        ...dog(),
        flights: [{ risers: 9, landingAfter: null }],
      }).success,
    ).toBe(false);
  });
  it("B4c strip footing under a bottom end on ground", () => {
    const base = ref();
    const i: StairsInput = {
      ...base,
      bottomSupport: {
        ...base.bottomSupport,
        onGround: true,
        footing: {
          ...base.bottomSupport.footing,
          design: true,
          width: 800,
          thickness: 300,
          soilCover: 300,
          qa: 100,
        },
      },
    };
    const r = analyzeStairs(i);
    const f = r.footing!;
    const rx = r.strips[0].reactions[0];
    const P = rx.service.v + 24 * 0.8 * 0.3 + 18 * 0.3 * (0.8 - 0.25);
    expect(f.serviceP).toBeCloseTo(P, 6);
    expect(f.qMax).toBeCloseTo(P / 0.8, 6);
    const qu = rx.factored.vMax / 0.8,
      c = (800 - 250) / 2;
    expect(f.mu).toBeCloseTo((qu * (c / 1000) ** 2) / 2, 6);
    expect(check(r, "footing:bearing").dcr).toBeCloseTo(P / 0.8 / 100, 6);
    expect(r.checks.some((c2) => c2.id === "footing:sliding")).toBe(false);
  });
  it("footing by others reports the reactions instead", () => {
    const base = ref();
    const r = analyzeStairs({
      ...base,
      bottomSupport: { ...base.bottomSupport, onGround: true },
    });
    expect(r.footing).toBeNull();
    expect(r.notes.some((n) => /footing by others/.test(n))).toBe(true);
  });
});

describe("stairs: draft, review and clauses", () => {
  it("draft schema round-trips the default input", () => {
    const d = stairsDraftSchema.parse({
      kind: "stairs",
      version: 1,
      input: defaultStairsInput(),
    });
    expect(d.input.stairType).toBe("single");
  });
  it("every review row cites a clause and every DCR is a number", () => {
    const r = analyzeStairs(defaultStairsInput());
    const rows = stairsDesignChecks(r);
    expect(rows.length).toBeGreaterThan(10);
    for (const c of rows) {
      expect(c.clause.length).toBeGreaterThan(5);
      expect(typeof c.dcr === "number" || c.dcr === null).toBe(true);
    }
    expect(rows.some((c) => /ACI 318-19 7\.5\.1\.1/.test(c.clause))).toBe(true);
    expect(r.engineVersion).toBe("stairs-0.1.0");
  });
});

describe("stairs: code basis seam (Code Basis K3/K5)", () => {
  it("legacy NSCP 2015 drafts load as ACI 318-19 with identical checks (17 Oct 2026)", async () => {
    const m = await import("../src");
    const aciInput = { ...defaultStairsInput(), otherCodes: "ASCE 7-16" };
    const legacy = m.stairsInputSchema.parse({ ...aciInput, code: "NSCP 2015" });
    expect(legacy.code).toBe("ACI 318-19");
    expect(legacy.otherCodes).toBe("NSCP 2015 (project standard); ASCE 7-16");
    expect(m.stairCalculationBasis(legacy)).toBe("ACI 318-19");
    expect(m.stairCodeBasisLabel(legacy)).toBe("Calculation basis: ACI 318-19.");
    expect(Object.keys(m.stairProvisions)).toEqual(["ACI 318-19"]);
    const a = analyzeStairs(legacy),
      b = analyzeStairs(aciInput);
    expect(a.checks.map((c) => c.dcr)).toEqual(b.checks.map((c) => c.dcr));
  });
});

describe("stairs: per-zone top-bar checks and marks (Suggest fix, V3)", () => {
  it("reports −M per top-bar zone with its own mark", async () => {
    const m = await import("../src");
    const r = analyzeStairs({
      ...defaultStairsInput(),
      bottomSupport: {
        ...defaultStairsInput().bottomSupport,
        condition: "Fixed",
      },
      topSupport: { condition: "Fixed", bearing: 250 },
    });
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain("s1:flight-1:flexure-neg:topBottom");
    expect(ids).toContain("s1:top-landing:flexure-neg:topTop");
    expect(ids.some((x) => /flexure-neg$/.test(x))).toBe(false);
    const t2 = r.checks.find(
      (c) => c.id === "s1:top-landing:flexure-neg:topTop",
    )!;
    expect(t2.label).toContain("T2");
    expect(m.stairBarMarks.topKnee).toBe("T3");
    const q = m.stairQuantities(defaultStairsInput());
    expect(new Set(q.bars.map((b) => b.mark))).toEqual(
      new Set(["B1", "T1", "T2", "T3", "D1"]),
    );
  });
  it("draft keeps the estimate switch and beam depths", () => {
    const d = stairsDraftSchema.parse({
      kind: "stairs",
      version: 1,
      input: {
        ...defaultStairsInput(),
        topSupport: { condition: "Pinned", bearing: 300, beamDepth: 600 },
      },
      estimate: { enabled: true },
    });
    expect(d.estimate?.enabled).toBe(true);
    expect(d.input.topSupport.beamDepth).toBe(600);
    // older drafts without the new fields still open
    const old = stairsDraftSchema.safeParse({
      kind: "stairs",
      version: 1,
      input: {
        ...defaultStairsInput(),
        topSupport: { condition: "Pinned", bearing: 250 },
      },
    });
    expect(old.success).toBe(true);
  });
});

describe("stairs: review headings per flight", () => {
  it("dog-leg: one heading per flight, then reinforcement, detailing", async () => {
    const m = await import("../src");
    const r = analyzeStairs({
      ...defaultStairsInput(),
      stairType: "dog-leg",
      topLanding: { length: 1200, thickness: 200, width: 0 },
      flights: [
        {
          risers: 9,
          landingAfter: {
            length: 1300,
            thickness: 200,
            width: 0,
            startSupport: "None",
            endSupport: "Pinned",
          },
        },
        { risers: 9, landingAfter: null },
      ],
    });
    const sections = m.stairsDesignCheckSections(r);
    expect(sections.map((s) => s.title)).toEqual([
      "Flight 1",
      "Flight 2",
      "Reinforcement (all flights)",
      "Detailing",
    ]);
    const f2 = sections[1];
    expect(f2.checks.some((c) => c.label.startsWith("Mid landing ·"))).toBe(
      true,
    );
    expect(f2.checks.some((c) => c.label.startsWith("Top landing ·"))).toBe(
      true,
    );
    expect(f2.checks.every((c) => !c.label.includes("strip"))).toBe(true);
    expect(f2.governing).toBe(Math.max(...f2.checks.map((c) => c.dcr ?? 0)));
    // every check sits under exactly one heading
    expect(sections.reduce((n, s) => n + s.checks.length, 0)).toBe(
      r.checks.length,
    );
  });
  it("single span with an intermediate landing: a heading per flight and a whole-stair span heading", async () => {
    const m = await import("../src");
    const r = analyzeStairs({
      ...defaultStairsInput(),
      flights: [
        {
          risers: 6,
          landingAfter: {
            length: 1200,
            thickness: 200,
            width: 0,
            startSupport: "None",
            endSupport: "None",
          },
        },
        { risers: 6, landingAfter: null },
      ],
    });
    const titles = m.stairsDesignCheckSections(r).map((s) => s.title);
    expect(titles.slice(0, 3)).toEqual([
      "Flight 1",
      "Flight 2",
      "Spans (whole stair)",
    ]);
    expect(
      r.checks.find((c) => c.id === "s1:landing-1:flexure-pos")?.section,
    ).toBe("Flight 1");
    expect(
      r.checks.find((c) => c.id === "s1:flight-2:flexure-pos")?.section,
    ).toBe("Flight 2");
  });
});

describe("stairs: Optimize spacing (target DCR)", () => {
  it("returns the largest spacing with every governed check < 1.0 and ≤ target", async () => {
    const m = await import("../src");
    const i = defaultStairsInput();
    for (const set of [
      "mainBottom",
      "topTop",
      "topKnee",
      "distribution",
    ] as const) {
      const res = m.stairOptimizeSpacing(i, set, 0.95);
      if (res.spacing === null) continue;
      const r = analyzeStairs({
        ...i,
        bars: { ...i.bars, [set]: { ...i.bars[set], spacing: res.spacing } },
      });
      const own = m
        .stairsDesignChecks(r)
        .filter((c) => m.stairOptimizeGoverns[set](c.id));
      expect(own.every((c) => (c.dcr ?? 9) <= 0.95)).toBe(true);
      // one step wider fails (or is the 300 mm upper bound)
      const k = m.STAIR_OPTIMIZE_SPACINGS.indexOf(res.spacing as never);
      if (k > 0) {
        const wider = m.STAIR_OPTIMIZE_SPACINGS[k - 1];
        const r2 = analyzeStairs({
          ...i,
          bars: { ...i.bars, [set]: { ...i.bars[set], spacing: wider } },
        });
        const own2 = m
          .stairsDesignChecks(r2)
          .filter((c) => m.stairOptimizeGoverns[set](c.id));
        expect(own2.some((c) => (c.dcr ?? 9) > 0.95)).toBe(true);
      }
      expect(res.message).toContain(m.stairBarMarks[set]);
    }
  });
  it("a 1.00 target still requires DCR strictly below 1.0", async () => {
    const m = await import("../src");
    const res = m.stairOptimizeSpacing(defaultStairsInput(), "mainBottom", 1);
    expect(res.governing === null || (res.governing.dcr ?? 1) < 1).toBe(true);
  });
  it("main bottom bars fall back to strength when deflection cannot be met", async () => {
    const m = await import("../src");
    // 150 mm waist with a 1.2 m top landing: deflection governs (earlier smoke run DCR ≈ 2.1)
    const i = {
      ...defaultStairsInput(),
      waist: 150,
      topLanding: { length: 1200, thickness: 150, width: 0 },
    };
    const res = m.stairOptimizeSpacing(i, "mainBottom", 0.95);
    expect(res.mode).toBe("strength");
    expect(res.message).toContain("increase the waist or landing thickness");
  });
});
