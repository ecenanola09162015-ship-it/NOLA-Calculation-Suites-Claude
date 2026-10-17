import { describe, expect, it } from "vitest";
import { analyzeStairs, defaultStairsInput, type StairsInput } from "../src";

/**
 * Stairs benchmark SB-1 (dog-leg, 2 × 13 risers, R 153.8, T 340, B 1.8 m,
 * landing 1,460 mm; footing on soil / landing beam pinned / top beam fixed).
 * Expected values come from the independent hand calculation in
 * Stairs_Benchmark_SB1.xlsx (force method by virtual work + ACI 318-19
 * section formulas), not from this module. Tolerance 0.5 %.
 */
export function benchmarkSB1(): StairsInput {
  const d = defaultStairsInput();
  return {
    ...d,
    stairType: "dog-leg",
    widthMode: "full",
    fc: 27.6,
    fy: 414,
    riser: 2000 / 13,
    going: 340,
    waist: 200,
    flightWidth: 1800,
    flightGap: 100,
    bottomLanding: { length: 0, thickness: 200, width: 0 },
    topLanding: { length: 0, thickness: 200, width: 0 },
    flights: [
      {
        risers: 13,
        landingAfter: {
          length: 1460,
          thickness: 200,
          width: 0,
          startSupport: "None",
          endSupport: "Pinned",
        },
      },
      { risers: 13, landingAfter: null },
    ],
    bottomSupport: {
      ...d.bottomSupport,
      condition: "Pinned",
      onGround: true,
      footing: {
        ...d.bottomSupport.footing,
        design: true,
        qa: 150,
        width: 600,
        thickness: 300,
        soilCover: 700,
      },
    },
    topSupport: { condition: "Fixed", bearing: 250, beamDepth: 500 },
    finishes: 1.0,
    soffitFinish: 0,
    live: 4.8,
  };
}

const near = (actual: number, expected: number, tol = 0.005) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.abs(expected) * tol,
  );

describe("stairs benchmark SB-1 vs independent hand calculation", () => {
  const r = analyzeStairs(benchmarkSB1());
  const [s1, s2] = r.strips;
  const check = (id: string) => {
    const c = r.checks.find((x) => x.id === id);
    if (!c) throw new Error(`missing check ${id}`);
    return c;
  };

  it("runs without error", () => expect(r.error).toBeNull());

  it("loads on plan", () => {
    near(r.loads.flight.total, 8.1147);
    near(r.loads.landings[0].dead, 5.8);
  });

  it("flight 1 strip: reactions, thrust, Mu+ and knee Mu−", () => {
    near(s1.reactions[0].dead.v, 51.242);
    near(s1.reactions[0].live.v, 31.581);
    near(s1.reactions[0].service.h, 130.92);
    near(s1.reactions[1].dead.v, 19.544);
    near(s1.reactions[1].live.v, 13.296);
    near(s1.reactions[0].factored.vMax, 112.02);
    near(s1.reactions[1].factored.vMin, -19.58);
    near(Math.max(...s1.stations.map((s) => s.mPos)), 65.35);
    near(Math.min(...s1.stations.map((s) => s.mNeg)), -30.33);
  });

  it("flight 2 strip: reactions, Mu+ and fixed-end Mu−", () => {
    near(s2.reactions[0].dead.v, 15.154);
    near(s2.reactions[1].dead.v, 45.427);
    near(s2.reactions[1].live.v, 27.883);
    near(s2.reactions[1].factored.mAbsMax, 73.61);
    const flight = s2.stations.filter((s) => s.kind === "flight");
    near(Math.max(...flight.map((s) => s.mPos)), 41.13);
  });

  it("deflection (Ie, Table 24.2.3.5; λΔ = 2.0)", () => {
    near(s1.spans[0].ieRatio, 0.21175);
    near(s1.spans[0].immediateLive, 18.469);
    near(s1.spans[0].total, 78.1);
    near(s2.spans[0].ieRatio, 0.24032);
    near(s2.spans[0].immediateLive, 8.537);
    near(s2.spans[0].total, 35.87);
  });

  it("section capacities and code limits", () => {
    expect(check("s1:flight-1:flexure-pos").detail).toContain("φMn = 47.01");
    expect(check("s2:flight-2:flexure-neg:topTop").detail).toContain(
      "φMn = 23.97",
    );
    expect(check("s1:flight-1:flexure-neg:topKnee").detail).toContain(
      "φMn = 35.61",
    );
    near(s1.spans[0].hmin, 296.12);
    near(s2.spans[0].hmin, 260.64);
    expect(check("detail:knee-bottom").detail).toContain("ld = 317");
    expect(check("detail:top-anchorage").detail).toContain("ldh 246");
  });
});
