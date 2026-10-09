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
