/**
 * Bundles are one bar for the ties (18 Oct 2026): no cross-tie positions,
 * legs or supported counts from the added bars of a bundle (ACI 318-19
 * 25.6.1.2, 25.7.2.3, 18.7.5.2). Generator always visible.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  bundleBars,
  confinementLayout,
  crossTieCandidatePositions,
  defaultColumnTieDesign,
  designColumnTransverse,
  tieBars,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { crossTieCandidates } from "../src/lib/column-tie-layout";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";

// 600 × 800, D20, 4 bars across b × 5 along h: x = ±240, y = ±340.
const xs = [-240, -80, 80, 240],
  ys = [-340, -170, 0, 170, 340];
const input: RectangularColumnInput = {
  code: "ACI 318-19", width: 600, depth: 800, fc: 34.5, fy: 420, es: 200000, cover: 40, tieDiameter: 10,
  bars: [
    ...xs.flatMap((x) => [-340, 340].map((y) => ({ x, y, diameter: 20 }))),
    ...ys.slice(1, -1).flatMap((y) => [-240, 240].map((x) => ({ x, y, diameter: 20 }))),
  ],
  loads: [{ id: "U", description: "", pu: 3000, mx: 300, my: 200, vx: 400, vy: 400, included: true }],
};
const corners = input.bars.map((b, i) => (Math.abs(b.x) === 240 && Math.abs(b.y) === 340 ? i : -1)).filter((i) => i >= 0);
const bundled = { ...input, bars: bundleBars(input, corners, 3).bars };

describe("bundle = one bar for the ties", () => {
  it("tieBars keeps singles + one anchor per bundle", () => {
    expect(bundled.bars).toHaveLength(14 + 8);
    expect(tieBars(bundled.bars)).toHaveLength(14);
    expect(tieBars(bundled.bars).filter((b) => b.bundle).map((b) => [Math.abs(b.x), Math.abs(b.y)])).toEqual(
      Array(4).fill([240, 340]),
    );
  });
  it("cross-tie positions come from the real bar lines only (same as without bundles)", () => {
    // ∥X: rows y = −170, 0, 170; ∥Y: columns x = −80, 80.
    expect(crossTieCandidatePositions(bundled.bars, "X")).toEqual([-170, 0, 170]);
    expect(crossTieCandidatePositions(bundled.bars, "Y")).toEqual([-80, 80]);
    expect(crossTieCandidates(bundled, "X")).toEqual([-170, 0, 170]);
    // Without the fix the inner bundle bars (y = ±320) became extra positions.
    expect(crossTieCandidatePositions(bundled.bars, "X")).not.toContain(-320);
  });
  it("legs, supported count and hx equal the layout without bundles", () => {
    const a = confinementLayout(input.bars, 3, 2),
      b = confinementLayout(bundled.bars, 3, 2);
    expect([b.legsX, b.legsY, b.nl, b.hx]).toEqual([a.legsX, a.legsY, a.nl, a.hx]);
    expect([b.legsX, b.legsY]).toEqual([5, 4]);
    expect(b.supported).toHaveLength(14);
    // No cross-tie within one bar diameter of a hoop leg (y = ±340).
    expect(b.crossX.every((y) => Math.abs(Math.abs(y) - 340) > 20)).toBe(true);
  });
  it("shear Av uses the same legs with or without bundles (22.5.8.5)", () => {
    const base = defaultColumnTieDesign(input, 2500);
    const tie = { ...base, shear: { enabled: true }, tie: { ...base.tie, diameter: 12, interiorX: 3, interiorY: 2 } };
    const t0 = designColumnTransverse(input, tie),
      t1 = designColumnTransverse(bundled, tie);
    expect([t1.layout.legsX, t1.layout.legsY]).toEqual([t0.layout.legsX, t0.layout.legsY]);
  });
});

describe("bar generator always visible", () => {
  it("fields and button render without opening anything", () => {
    const html = renderToStaticMarkup(<RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />);
    const p2 = html.slice(html.indexOf("02 · Reinforcement"), html.indexOf("Bundled Bars"));
    expect(p2).toContain('<h3 class="rcSubhead">Generate A Uniform Perimeter Layout</h3>');
    expect(p2).not.toContain("<summary>Generate A Uniform Perimeter Layout");
    expect(p2).toContain("Bars Across b (Including Corners)");
    expect(p2).toContain("Replace bar layout");
  });
});
