import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnSlenderness,
  defaultColumnStorey,
  defaultColumnTieDesign,
  designColumnTransverse,
  effectiveColumnQuantity,
  migrateColumnStorey,
  nominalMomentAtP,
  storeyClearHeights,
  storeyError,
  type RectangularColumnInput,
} from "../src";

// Worked example from the decisions sheet: H 3500, beam along X 600,
// beam along Y 500, column b × h = 600 × 800.
//   ℓu,x (Mux) = 3500 − 500 = 3000; ℓu,y (Muy) = 3500 − 600 = 2900 (6.2.4)
//   r,x = 0.3·800 = 240 → kℓu/r = 12.5; r,y = 0.3·600 = 180 → 16.11 (6.2.5.2)
//   lo clear = max(3000, 2900) = 3000 → lo = max(800, 500, 450) = 800 (18.7.5.1)
//   joint = deeper beam = 600 (18.8.3); estimate clear = 2900
const storey = { ...defaultColumnStorey(), height: 3500, beamX: 600, beamY: 500 };
const bars = [-245, -82, 82, 245].flatMap((x) =>
  [-345, 345].map((y) => ({ x, y, diameter: 25 })),
);
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars,
  loads: [{ id: "U1", description: "", pu: 2000, mx: 200, my: 150, included: true }],
  slenderness: { ...defaultColumnSlenderness(9999), enabled: true },
  storey,
};

describe("storey geometry → ℓu, lo, Ve, estimate", () => {
  it("clear heights (hand calculation)", () => {
    const h = storeyClearHeights(storey);
    expect(h).toMatchObject({ derivedX: 3000, derivedY: 2900, luX: 3000, luY: 2900, loClear: 3000, joint: 600 });
    // Capital / drop and bottom deductions (6.2.4: to the lower extremity).
    const c = storeyClearHeights({ ...storey, capital: 150, bottom: 100 });
    expect([c.luX, c.luY]).toEqual([2750, 2650]);
    // Override per direction.
    expect(storeyClearHeights({ ...storey, luOverrideY: 2000 }).luY).toBe(2000);
    expect(storeyError({ ...storey, beamX: 3600 })).not.toBe("");
  });
  it("slenderness uses ℓu from storey, not the typed value", () => {
    const r = analyzeRectangularColumn(input);
    const sl = r.checks[0]!.slenderness!;
    expect(sl.x.klur).toBeCloseTo(3000 / 240, 9);
    expect(sl.y.klur).toBeCloseTo(2900 / 180, 9);
  });
  it("lo from the larger ℓu; Ve per direction (18.7.5.1, 18.7.6.1.1)", () => {
    const base = defaultColumnTieDesign(input, 1234);
    const t = designColumnTransverse(input, {
      ...base,
      confinement: { ...base.confinement, enabled: true, frame: "SMF" },
    });
    expect(t.clearFromStorey).toBe(true);
    expect(t.clearHeight).toBe(3000);
    expect(t.lo).toBe(800);
    expect(t.clearHeightsVe).toEqual({ x: 2900, y: 3000 });
    const mprY = nominalMomentAtP(input, "y", 2000, 1.25);
    const mprX = nominalMomentAtP(input, "x", 2000, 1.25);
    expect(t.ve.x).toBeCloseTo((2 * mprY * 1000) / 2900, 6);
    expect(t.ve.y).toBeCloseTo((2 * mprX * 1000) / 3000, 6);
    // Manual source keeps the typed clear height (legacy / override).
    const m = designColumnTransverse(input, {
      ...base,
      confinement: { ...base.confinement, enabled: true, frame: "SMF", clearHeightSource: "manual" },
    });
    expect(m.clearHeight).toBe(1234);
  });
  it("estimate takes H and the deeper beam unless overridden", () => {
    const q = { ...defaultColumnQuantity(10), height: 3000, beamDepth: 500 };
    expect(effectiveColumnQuantity(input, q)).toMatchObject({ height: 3500, beamDepth: 600 });
    expect(effectiveColumnQuantity(input, { ...q, geometryOverride: true })).toMatchObject({ height: 3000, beamDepth: 500 });
  });
  it("old drafts migrate without changing their numbers", () => {
    const old = { ...input, storey: undefined, slenderness: { ...defaultColumnSlenderness(2800), enabled: true } };
    const base = defaultColumnTieDesign(input, 2600);
    const tie = { ...base, confinement: { ...base.confinement, enabled: true } };
    const { input: next, tie: nt } = migrateColumnStorey(
      old,
      { height: 3200, beamDepth: 450 },
      tie,
    );
    expect(next.storey).toMatchObject({ height: 3200, beamX: 450, beamY: 450, luOverrideX: 2800, luOverrideY: 2800 });
    expect(nt!.confinement.clearHeightSource).toBe("manual"); // 2600 ≠ 2750
    const same = migrateColumnStorey(
      { ...old, slenderness: { ...old.slenderness, x: { ...old.slenderness.x, lu: 2750 }, y: { ...old.slenderness.y, lu: 2750 } } },
      { height: 3200, beamDepth: 450 },
      { ...tie, confinement: { ...tie.confinement, clearHeight: 2750 } },
    );
    expect(same.input.storey).toMatchObject({ luOverrideX: null, luOverrideY: null });
    expect(same.tie!.confinement.clearHeightSource).toBe("storey");
  });
});
