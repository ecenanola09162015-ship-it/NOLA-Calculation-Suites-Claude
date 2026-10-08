import { describe, it, expect } from "vitest";
import {
  defaultColumnQuantity,
  estimateColumnQuantity,
  rebarUnitWeight,
  columnHookGeometry,
  columnDraftSchema,
  type RectangularColumnInput,
} from "../src";
const section: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 400,
  depth: 500,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [
    { x: -130, y: -180, diameter: 20 },
    { x: 130, y: -180, diameter: 20 },
    { x: -130, y: 180, diameter: 25 },
    { x: 130, y: 180, diameter: 25 },
  ],
  loads: [
    { id: "LC1", description: "", pu: 1000, mx: 0, my: 0, included: true },
  ],
};
function q() {
  const v = defaultColumnQuantity();
  v.enabled = true;
  v.height = 1000;
  v.beamDepth = 0;
  v.firstOffset = 0;
  v.lastOffset = 0;
  v.hookBasis = "allowance8db";
  v.zones = [
    {
      name: "Full",
      start: 0,
      end: 1000,
      spacing: 300,
      diameter: 10,
      fy: 280,
      hoops: 1,
      legsX: 3,
      legsY: 2,
    },
  ];
  return v;
}
describe("column quantity estimate", () => {
  it("uses checked cutting-length overrides and labels their source", () => {
    const v = q();
    v.zones[0].hoopLength = 1700;
    v.zones[0].crossXLength = 510;
    const r = estimateColumnQuantity(section, v)!;
    expect(r.rows.find((b) => b.mark === "Z1-H")?.length).toBe(1.7);
    expect(r.rows.find((b) => b.mark === "Z1-X")?.lengthBasis).toBe(
      "Designer cutting length",
    );
    expect(r.shear).toBeCloseTo(5 * (1.7 + 0.51) * rebarUnitWeight(10));
  });
  it("uses circular steel area times density, with diameter in metres", () => {
    expect(rebarUnitWeight(20)).toBeCloseTo(Math.PI * 0.01 ** 2 * 7850, 10);
    expect(rebarUnitWeight(10)).toBeCloseTo(0.6165375583, 9);
  });
  it("counts actual tie levels, physical pieces and totals without treating legs as hooks", () => {
    const r = estimateColumnQuantity(section, q())!;
    expect(r.zones[0].elevations).toEqual([0, 250, 500, 750, 1000]);
    expect(r.tieSets).toBe(5);
    const hoop = r.rows.find((b) => b.mark === "Z1-H")!,
      cross = r.rows.find((b) => b.mark === "Z1-X")!;
    expect(hoop.count).toBe(5);
    expect(hoop.length).toBeCloseTo(1.6);
    expect(cross.length).toBeCloseTo(0.47);
    expect(r.concrete).toBeCloseTo(0.2);
    expect(r.longitudinal).toBeCloseTo(
      2 * (rebarUnitWeight(20) + rebarUnitWeight(25)),
    );
    expect(r.shear).toBeCloseTo(5 * (1.6 + 0.47) * rebarUnitWeight(10));
    expect(r.ratio).toBeCloseTo(r.total / 0.2);
  });
  it("assigns shared boundaries to upper zones once and preserves different grades", () => {
    const v = q();
    v.zones = [
      { ...v.zones[0], end: 500, spacing: 250 },
      { ...v.zones[0], name: "Upper", start: 500, spacing: 100, fy: 420 },
    ];
    const r = estimateColumnQuantity(section, v)!;
    expect(r.tieSets).toBe(8);
    expect(r.zones[0].elevations).toEqual([0, 250]);
    expect(r.zones[1].elevations[0]).toBe(500);
    expect(r.rows.some((b) => b.fy === 280)).toBe(true);
  });
  it("scales weight and concrete together for identical members", () => {
    const v = q(),
      one = estimateColumnQuantity(section, v)!;
    v.members = 3;
    const three = estimateColumnQuantity(section, v)!;
    expect(three.total).toBeCloseTo(one.total * 3);
    expect(three.concrete).toBeCloseTo(one.concrete * 3);
    expect(three.ratio).toBeCloseTo(one.ratio);
  });
  it("rejects zone gaps, overlaps, invalid leg/hoop counts and a zone crossing the joint", () => {
    const v = q();
    v.zones[0].start = 1;
    expect(() => estimateColumnQuantity(section, v)).toThrow(/gaps/);
    v.zones[0].start = 0;
    v.zones[0].hoops = 2;
    expect(() => estimateColumnQuantity(section, v)).toThrow(/two legs/);
    v.zones[0].hoops = 1;
    v.beamDepth = 200;
    expect(() => estimateColumnQuantity(section, v)).toThrow(/joint/);
  });
  it("supports disabling independently of section checks", () => {
    const v = q();
    v.enabled = false;
    expect(estimateColumnQuantity({ ...section, width: NaN }, v)).toBeNull();
    expect(
      columnDraftSchema.safeParse({
        kind: "rc-column",
        version: 1,
        input: section,
        scopeConfirmed: false,
        quantity: v,
      }).success,
    ).toBe(true);
  });
  it("retains old drafts and validates the optional estimate", () => {
    const payload = {
      kind: "rc-column",
      version: 1,
      input: section,
      scopeConfirmed: false,
    };
    expect(columnDraftSchema.safeParse(payload).success).toBe(true);
    expect(
      columnDraftSchema.safeParse({
        ...payload,
        quantity: { ...q(), members: -1 },
      }).success,
    ).toBe(false);
  });
  it("applies verified ACI hook extensions and bend classes within supported sizes", () => {
    expect(columnHookGeometry(10, "aci135")).toEqual({
      angle: 135,
      extension: 76.2,
      insideBend: 40,
    });
    expect(columnHookGeometry(16, "aci135").extension).toBe(96);
    expect(columnHookGeometry(20, "aci135").insideBend).toBe(120);
    expect(() => columnHookGeometry(32, "aci135")).toThrow(/supports/);
  });
});
