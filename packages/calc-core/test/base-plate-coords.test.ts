/**
 * Custom anchor rod coordinates (engine base-plate-0.6.0): points measured
 * from the column centroid replace the nx × ny grid everywhere.
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBasePlate,
  basePlateDesignChecks,
  basePlateDraftSchema,
  basePlateInputSchema,
  basePlateRods,
  defaultBasePlateInput,
  type BasePlateInput,
} from "../src";

const asCustom = (i: BasePlateInput, pts = basePlateRods(i)) => {
  const j = structuredClone(i);
  j.anchors = {
    ...j.anchors,
    layout: "custom",
    points: pts.map((r) => ({ id: r.id, x: r.x, y: r.y })),
  };
  return j;
};
const strip = (r: unknown) =>
  JSON.parse(JSON.stringify(r, (_k, v) => (v === Infinity ? "inf" : v)));

describe("custom coordinates", () => {
  it("the current grid entered as points gives identical results", () => {
    const i = defaultBasePlateInput();
    const j = asCustom(i);
    expect(basePlateInputSchema.safeParse(j).success).toBe(true);
    const a = analyzeBasePlate(i),
      b = analyzeBasePlate(j);
    expect(strip(b.combos)).toEqual(strip(a.combos));
    const ca = basePlateDesignChecks(i, a).map((c) => [c.id, c.dcr]);
    const cb = basePlateDesignChecks(j, b).map((c) => [c.id, c.dcr]);
    expect(cb).toEqual(ca);
  });
  it("old drafts open with an empty point list", () => {
    const i = defaultBasePlateInput() as unknown as {
      anchors: Record<string, unknown>;
    };
    delete i.anchors.points;
    const d = basePlateDraftSchema.parse({
      kind: "base-plate",
      version: 1,
      input: i,
    });
    expect(d.input.anchors.points).toEqual([]);
  });
  it("rejects < 2 rods, duplicate IDs and rods outside the plate", () => {
    const i = defaultBasePlateInput();
    const bad = (pts: { id: string; x: number; y: number }[]) =>
      basePlateInputSchema.safeParse(
        asCustom(
          i,
          pts.map((p, k) => ({ ...p, i: k, j: 0 })),
        ),
      ).success;
    expect(bad([{ id: "A1", x: 0, y: 150 }])).toBe(false);
    expect(
      bad([
        { id: "A1", x: 0, y: 150 },
        { id: "A1", x: 0, y: -150 },
      ]),
    ).toBe(false);
    expect(
      bad([
        { id: "A1", x: 0, y: 150 },
        { id: "A2", x: 0, y: i.plate.by },
      ]),
    ).toBe(false);
  });
  it("minimum spacing is the closest pair; extra rod on the tension row", () => {
    const i = defaultBasePlateInput();
    const pts = basePlateRods(i);
    const extra = { id: "A5", i: 4, j: 0, x: 0, y: pts[0]!.y + 3 };
    const j = asCustom(i, [...pts, extra]);
    expect(basePlateInputSchema.safeParse(j).success).toBe(true);
    const r = analyzeBasePlate(j);
    expect(r.geometry.minSpacing).toBeCloseTo(Math.hypot(pts[0]!.x, 3), 6);
    // The rod 3 mm off the outer row joins that tension row (5 mm tolerance).
    const grid = analyzeBasePlate(i);
    const k = grid.combos.findIndex(
      (c) =>
        c.rodTension.filter((t) => t > 0).length === 2 &&
        c.rodTension[0]! > 0 &&
        c.rodTension[1]! > 0,
    );
    expect(k).toBeGreaterThanOrEqual(0);
    expect(r.combos[k]!.rodTension.filter((t) => t > 0)).toHaveLength(3);
  });
});
