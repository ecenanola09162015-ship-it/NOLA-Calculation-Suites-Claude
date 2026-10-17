/**
 * Bundled bars — hand checks (ACI 318-19 25.6.1, 25.2.3, 20.5.1.3.4, 25.7.2.2).
 * Section 600 × 800, cover 40, tie Ø10, D25 bars: bar centres at
 * x = ±(300 − 40 − 10 − 12.5) = ±237.5, y = ±(400 − 62.5) = ±337.5.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  bundleBars,
  bundleEquivalentDiameter,
  bundleIssues,
  bundleSummary,
  bundleUnits,
  columnDraftSchema,
  unbundleBars,
  type RectangularColumnInput,
} from "../src";

const xs = [-237.5, -79.2, 79.2, 237.5];
const base: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 34.5,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [
    ...xs.map((x) => ({ x, y: -337.5, diameter: 25 })),
    ...xs.map((x) => ({ x, y: 337.5, diameter: 25 })),
    { x: -237.5, y: 0, diameter: 25 },
    { x: 237.5, y: 0, diameter: 25 },
  ],
  loads: [{ id: "U", description: "", pu: 3000, mx: 400, my: 200, included: true }],
};
const corners = [0, 3, 4, 7];

describe("bundle geometry (picked bar stays; added bars touch it)", () => {
  it("2, 3, 4 bars at a corner and on a face", () => {
    const two = bundleBars(base, [0], 2);
    expect(two.applied).toBe(true);
    // Corner (−237.5, −337.5): second bar along the h face, +25 in y.
    expect(two.bars.filter((b) => b.bundle === "B1")).toEqual([
      { x: -237.5, y: -337.5, diameter: 25, bundle: "B1" },
      { x: -237.5, y: -312.5, diameter: 25, bundle: "B1" },
    ]);
    const four = bundleBars(base, [0], 4).bars.filter((b) => b.bundle === "B1");
    expect(four.map((b) => [b.x, b.y])).toEqual([
      [-237.5, -337.5],
      [-237.5, -312.5],
      [-212.5, -337.5],
      [-212.5, -312.5],
    ]);
    // Face bar (−237.5, 0): along the face (+y) and inward (+x).
    const three = bundleBars(base, [8], 3).bars.filter((b) => b.bundle === "B1");
    expect(three.map((b) => [b.x, b.y])).toEqual([
      [-237.5, 0],
      [-237.5, 25],
      [-212.5, 0],
    ]);
    // Only picked bars are bundled; others stay single.
    expect(two.bars.filter((b) => !b.bundle)).toHaveLength(9);
    expect(bundleSummary(bundleBars(base, corners, 2).bars)).toBe("4 × 2-bar bundles");
  });
  it("unbundle restores the single bar at its original position", () => {
    const b = bundleBars(base, corners, 3).bars;
    const back = unbundleBars({ bars: b }, b.map((_, i) => i));
    expect(b).toHaveLength(18);
    expect(back).toHaveLength(10);
    expect(back.every((x) => !x.bundle)).toBe(true);
    expect(back.map((x) => [x.x, x.y]).sort()).toEqual(base.bars.map((x) => [x.x, x.y]).sort());
  });
  it("equivalent diameter √n·db and unit centroid (25.6.1.6)", () => {
    expect(bundleEquivalentDiameter(25, 2)).toBeCloseTo(35.355, 3);
    expect(bundleEquivalentDiameter(25, 4)).toBeCloseTo(50, 9);
    const u = bundleUnits(bundleBars(base, [0], 2).bars).find((x) => x.bundle)!;
    expect(u.deq).toBeCloseTo(35.355, 3);
    expect(u.y).toBeCloseTo(-325, 9);
  });
});

describe("code checks", () => {
  it("more than 4 bars or mixed diameters: error (25.6.1.1)", () => {
    const five = { ...base, bars: [...base.bars.slice(0, 4).map((b) => ({ ...b, bundle: "B1" })), { x: 0, y: 0, diameter: 25, bundle: "B1" }] };
    expect(bundleIssues(five).some((i) => i.level === "error" && i.clause.includes("25.6.1.1"))).toBe(true);
    const mixed = bundleBars(base, [0], 2).bars.map((b, i) => (i === 1 ? { ...b, diameter: 20 } : b));
    expect(bundleIssues({ ...base, bars: mixed }).some((i) => i.text.includes("mixes bar diameters"))).toBe(true);
    // bundleBars refuses a size above 4.
    expect(bundleBars(base, [0], 5 as 4).applied).toBe(false);
  });
  it("spacing between bundles ≥ max(40, 1.5·db,eq) — refused when too close", () => {
    // Bundling bars 0 and 1 (158.3 mm apart) with 4 bars each: clear gap
    // between the inner bars = (−79.2 − 25) − (−212.5) − 25 = 83.3 mm ≥ 75 → OK.
    expect(bundleBars(base, [0, 1], 4).applied).toBe(true);
    // Move bar 1 next to bar 0: 2-bar bundle at 0 adds (−237.5, −312.5).
    const close = { ...base, bars: base.bars.map((b, i) => (i === 1 ? { ...b, x: -180 } : b)) };
    const r = bundleBars(close, [0], 4);
    expect(r.applied).toBe(false);
    expect(r.issues.some((i) => i.clause.includes("25.2.3"))).toBe(true);
  });
  it("cover to the bundle ≥ lesser of db,eq and 50 mm (20.5.1.3.4)", () => {
    // Cover to bars = 40 + 10 = 50 mm ≥ min(50, 50) for a 4-bar D25 bundle.
    expect(bundleIssues({ ...base, bars: bundleBars(base, [0], 4).bars }).some((i) => i.clause.includes("20.5.1.3.4"))).toBe(false);
    const thin = { ...base, cover: 25 }; // 35 mm to bars < 50
    const r = bundleBars({ ...thin, bars: thin.bars.map((b) => ({ ...b, x: Math.sign(b.x) * (Math.abs(b.x) ? 300 - 35 - 12.5 : 0), y: Math.sign(b.y) * (Math.abs(b.y) ? 400 - 35 - 12.5 : 0) })) }, [0], 4);
    expect(r.issues.some((i) => i.clause.includes("20.5.1.3.4"))).toBe(true);
  });
  it("tie below Ø12 with bundles: warning (25.7.2.2); notes for 25.6.1.5 / 25.6.1.7", () => {
    const issues = bundleIssues({ ...base, bars: bundleBars(base, corners, 2).bars });
    expect(issues.find((i) => i.clause.includes("25.7.2.2"))?.level).toBe("warning");
    expect(bundleIssues({ ...base, tieDiameter: 12, bars: bundleBars(base, corners, 2).bars }).some((i) => i.clause.includes("25.7.2.2"))).toBe(false);
    expect(issues.some((i) => i.clause.includes("25.6.1.5"))).toBe(true);
    expect(bundleIssues(base)).toEqual([]); // no bundles, no overlaps: nothing
  });
});

describe("strength and drafts", () => {
  it("each bar counted at its own position: As and P0 follow the bar count", () => {
    const b = { ...base, bars: bundleBars(base, corners, 2).bars };
    const r0 = analyzeRectangularColumn(base),
      r1 = analyzeRectangularColumn(b);
    const a25 = (Math.PI * 25 ** 2) / 4;
    expect(r1.steelArea - r0.steelArea).toBeCloseTo(4 * a25, 6);
    // P0 = 0.85 f′c (Ag − As) + fy As
    expect(r1.p0).toBeCloseTo((0.85 * 34.5 * (480000 - 14 * a25) + 420 * 14 * a25) / 1000, 6);
  });
  it("bundle id is saved with the draft", () => {
    const b = { ...base, bars: bundleBars(base, [0], 2).bars };
    const p = columnDraftSchema.parse({ kind: "rc-column", version: 1, scopeConfirmed: true, input: b });
    expect(p.input.bars[0]!.bundle).toBe("B1");
  });
});
