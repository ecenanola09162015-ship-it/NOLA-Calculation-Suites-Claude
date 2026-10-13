import { describe, expect, it } from "vitest";
import {
  defaultColumnQuantity,
  columnDraftSchema,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  adoptSectionTieDiameter,
  crossTiePositions,
} from "../src/lib/column-tie-layout";
const section: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 500,
  cover: 40,
  tieDiameter: 10,
  fc: 28,
  fy: 420,
  es: 200000,
  loads: [
    { id: "U1", description: "Test", pu: 100, mx: 0, my: 0, included: true },
  ],
  bars: [-140, 0, 140].flatMap((x) =>
    [-190, 0, 190].map((y) => ({ x, y, diameter: 20 })),
  ),
};
describe("column estimate geometry and adoption", () => {
  it("adopts diameter without changing zone spacing/grade/counts and clears old checked lengths", () => {
    const q = defaultColumnQuantity();
    q.zones[0].hoopLength = 1800;
    const next = adoptSectionTieDiameter(q, 12);
    expect(next.zones.every((z) => z.diameter === 12)).toBe(true);
    expect(next.zones[0].hoopLength).toBeNull();
    expect(next.zones[0].spacing).toBe(q.zones[0].spacing);
    expect(next.zones[0].legsX).toBe(q.zones[0].legsX);
    expect(q.zones[0].diameter).toBe(10);
  });
  it("uses aligned peripheral bars and does not invent missing connections", () => {
    const z = { ...defaultColumnQuantity().zones[0], legsX: 3, legsY: 3 };
    expect(crossTiePositions(section, z, "X")).toMatchObject({
      positions: [0],
      valid: true,
    });
    expect(crossTiePositions(section, z, "Y")).toMatchObject({
      positions: [0],
      valid: true,
    });
    expect(crossTiePositions(section, { ...z, legsX: 4 }, "X")).toMatchObject({
      positions: [0],
      valid: false,
      count: 2,
    });
    expect(
      crossTiePositions(section, { ...z, crossXPositions: [50] }, "X").valid,
    ).toBe(false);
    expect(
      crossTiePositions(section, { ...z, crossXPositions: [1000] }, "X")
        .drawable,
    ).toEqual([]);
  });
  it("retains optional drawing positions in persisted column drafts", () => {
    const quantity = defaultColumnQuantity();
    quantity.zones[0].crossXPositions = [0];
    const draft = columnDraftSchema.parse({
      kind: "rc-column",
      scopeConfirmed: true,
      version: 1,
      input: section,
      quantity,
    });
    expect(draft.quantity?.zones[0].crossXPositions).toEqual([0]);
  });
});

describe("cross-tie 135° hook geometry (ACI 318-19 25.3.2, 25.7.1.6)", () => {
  it("turns both tails away from the leg into the core at 45°", async () => {
    const { crossTieHookPath } = await import("../src/lib/column-tie-layout");
    // Bars at x = 100 and 300 on transverse line y = 200, bend radius 20, tail 60/√2.
    const r = 20,
      ext = 60 / Math.SQRT2,
      q = r / Math.SQRT2;
    const nums = crossTieHookPath(100, 300, 200, r, ext)
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    const [tx1, ty1, sx1, sy1] = nums;
    const [sx2, sy2, tx2, ty2] = nums.slice(-4);
    const legY = 200 + r;
    // Hook starts after a 135° wrap: upper-outer quadrant of each bar.
    expect(sx1).toBeCloseTo(100 - q);
    expect(sy1).toBeCloseTo(200 - q);
    expect(sx2).toBeCloseTo(300 + q);
    // Tails point away from the leg (smaller y) and inward at exactly 45°.
    expect(ty1).toBeLessThan(sy1);
    expect(ty2).toBeLessThan(sy2);
    expect(tx1 - sx1).toBeCloseTo(sy1 - ty1);
    expect(sx2 - tx2).toBeCloseTo(sy2 - ty2);
    expect(Math.hypot(tx1 - sx1, ty1 - sy1)).toBeCloseTo(60);
    expect(Math.max(ty1, ty2)).toBeLessThan(legY);
  });
});
