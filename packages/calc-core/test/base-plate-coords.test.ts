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
  basePlateMinimumPlate,
  basePlateRods,
  j34EdgeDistance,
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

describe("minimum plate from the column (engine 0.6.0)", () => {
  it("W12X40 default: g 52, e 38 (washer) → 390 × 490 mm", () => {
    const i = defaultBasePlateInput();
    const m = basePlateMinimumPlate(i);
    expect(m.g).toBeCloseTo(76.2 / 2 + 8 + 6, 9);
    expect(m.eGoverns).toBe("washer");
    expect(m.eTerms.j34).toBeCloseTo(31.75, 9);
    expect([m.sx, m.sy, m.bx, m.by]).toEqual([310, 410, 390, 490]);
    expect(m.fitsPedestal).toBe(true);
    // Applied, every geometry check passes.
    const j = structuredClone(i);
    j.plate = { ...j.plate, bx: m.bx, by: m.by };
    j.anchors = { ...j.anchors, sx: m.sx!, sy: m.sy! };
    const ck = basePlateDesignChecks(j, analyzeBasePlate(j));
    for (const id of ["geo-fit", "geo-clash", "geo-hole-edge"])
      expect(ck.find((c) => c.id === id)!.dcr!).toBeLessThanOrEqual(1);
  });
  it("rotated column and 3 × 2 grid split the rod lines", () => {
    const i = defaultBasePlateInput();
    i.rotation = 90;
    i.anchors = { ...i.anchors, nx: 3 };
    const m = basePlateMinimumPlate(i);
    expect(m.sx! * 2).toBe(up(302.26 + 2 * m.g));
    expect(m.sy).toBe(up(203.454 + 2 * m.g));
  });
  it("J3.4 governs a small washer; custom points keep their positions", () => {
    const i = defaultBasePlateInput();
    i.anchors = { ...i.anchors, washer: { size: 50, thickness: 6 }, hole: 33 };
    expect(basePlateMinimumPlate(i).eGoverns).toBe("AISC J3.4");
    i.anchors = {
      ...i.anchors,
      layout: "custom",
      points: [
        { id: "A1", x: -100, y: -200 },
        { id: "A2", x: 100, y: 200 },
      ],
    };
    const m = basePlateMinimumPlate(i);
    expect(m.sx).toBeNull();
    expect([m.bx, m.by]).toEqual([up(200 + 2 * 31.75), up(400 + 2 * 31.75)]);
  });
  it("flags a plate larger than the pedestal", () => {
    const i = defaultBasePlateInput();
    i.pedestal = { ...i.pedestal, px: 380 };
    expect(basePlateMinimumPlate(i).fitsPedestal).toBe(false);
    expect(j34EdgeDistance(24)).toBe(30);
    expect(j34EdgeDistance(50.8)).toBeCloseTo(63.5, 9);
  });
});
const up = (v: number) => Math.ceil(v / 10 - 1e-9) * 10;
