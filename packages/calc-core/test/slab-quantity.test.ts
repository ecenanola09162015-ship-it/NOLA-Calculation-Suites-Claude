import { describe, expect, it } from "vitest";
import {
  defaultSlabInput,
  defaultSlabQuantity,
  estimateSlabQuantity,
  slabDraftSchema,
  slabEstimateEnd,
} from "../src/index";
const setup = () => {
  const i = defaultSlabInput(),
    q = defaultSlabQuantity();
  q.enabled = true;
  q.clearX = 4300;
  q.clearY = 2500;
  return { i, q };
};
describe("slab quantities", () => {
  it("uses half-beam extensions and exact circular unit mass, excludes beam concrete", () => {
    const { i, q } = setup(),
      r = estimateSlabQuantity(i, q)!;
    const b = r.rows.find(
      (b) => b.axis === "X" && b.layer.startsWith("long-bottom"),
    )!;
    expect(b.count).toBe(14);
    expect(
      r.rows.find((b) => b.axis === "Y" && b.layer.startsWith("short-bottom"))!
        .count,
    ).toBe(30);
    expect(b.body).toBe(4.3);
    expect(b.length).toBeCloseTo(4.6, 10);
    expect(b.unitWeight).toBeCloseTo((Math.PI / 4) * 0.012 ** 2 * 7850, 12);
    expect(b.weight).toBeCloseTo(b.count * 4.6 * b.unitWeight, 10);
    expect(r.concrete).toBeCloseTo(4.3 * 2.5 * 0.15, 12);
    q.beams.west.width = 600;
    q.beams.east.depth = 900;
    expect(estimateSlabQuantity(i, q)!.concrete).toBe(r.concrete);
  });
  it("uses far cover to bar surface and per-diameter default hook tails", () => {
    const { q } = setup();
    const beam = q.beams.west;
    beam.main.extensionMode = "cover";
    beam.main.shape = "L-hook";
    expect(slabEstimateEnd(beam, "main", 12)).toEqual({
      extension: 254,
      tail: 144,
      shape: "L-hook",
      direction: "down",
    });
    expect(slabEstimateEnd(beam, "main", 16).tail).toBe(192);
    beam.main.hookTail = 250;
    expect(slabEstimateEnd(beam, "main", 16).tail).toBe(250);
    beam.extra.extensionMode = "custom";
    beam.extra.extension = 100;
    expect(slabEstimateEnd(beam, "extra", 16)).toMatchObject({
      extension: 100,
      tail: 0,
    });
  });
  it("counts top extras separately at each fixed support and bottom extras at central L/2", () => {
    const { i, q } = setup();
    for (const b of Object.values(i.extra)) b.enabled = true;
    const r = estimateSlabQuantity(i, q)!;
    const bottom = r.rows.find(
      (b) => b.group === "EXTRA BARS" && b.layer.startsWith("short-bottom"),
    )!;
    expect(bottom.body).toBe(1.25);
    expect(bottom.nearExtension).toBe(0);
    expect(bottom.farTail).toBe(0);
    const top = r.rows.filter(
      (b) => b.group === "EXTRA BARS" && b.layer.startsWith("short-top"),
    );
    expect(top).toHaveLength(2);
    expect(top[0].body).toBeCloseTo(2.5 / 3, 10);
    expect(top[0].length).toBeCloseTo(2.5 / 3 + 0.15, 10);
    i.supports.south = "Pinned";
    expect(
      estimateSlabQuantity(i, q)!.rows.filter(
        (b) => b.group === "EXTRA BARS" && b.layer.startsWith("short-top"),
      ),
    ).toHaveLength(1);
  });
  it("respects cutoff overrides and groups fy, members and steel shares", () => {
    const { i, q } = setup();
    i.extra["short-bottom"].enabled = true;
    i.cutoffs.bottomStart = 0.1;
    i.cutoffs.bottomEnd = 0.9;
    i.fy = 400;
    const r = estimateSlabQuantity(i, q)!;
    expect(r.rows.find((b) => b.group === "EXTRA BARS")!.body).toBe(2);
    expect(r.rows.every((b) => b.fy === 400)).toBe(true);
    expect(r.mainPercent + r.extraPercent).toBeCloseTo(100, 12);
    q.members = 3;
    const m = estimateSlabQuantity(i, q)!;
    expect(m.total).toBeCloseTo(r.total * 3, 10);
    expect(m.ratio).toBeCloseTo(r.ratio, 10);
  });
  it("excludes long extras in one-way slabs and labels distribution main bars", () => {
    const { i, q } = setup();
    i.lx = 6;
    i.ly = 2;
    for (const b of Object.values(i.extra)) b.enabled = true;
    q.clearX = 6000;
    q.clearY = 2000;
    const r = estimateSlabQuantity(i, q)!;
    expect(r.rows.some((b) => b.group === "EXTRA BARS" && b.axis === "X")).toBe(
      false,
    );
    expect(
      r.rows
        .filter((b) => b.axis === "X")
        .every((b) => b.function === "Distribution"),
    ).toBe(true);
  });
  it("flags hook fit and rejects extensions beyond the beam cover", () => {
    const { i, q } = setup();
    q.beams.south.main.shape = "L-hook";
    q.beams.south.main.hookTail = 1000;
    expect(
      estimateSlabQuantity(i, q)!.warnings.some((w) => w.includes("hook tail")),
    ).toBe(true);
    q.beams.south.main.hookTail = null;
    q.beams.south.main.hookDirection = "up";
    const up = estimateSlabQuantity(i, q)!;
    expect(
      up.rows.find((b) => b.axis === "Y" && b.layer.startsWith("short-bottom"))!
        .nearTailSign,
    ).toBe(-1);
    expect(up.warnings.some((w) => w.includes("short-bottom"))).toBe(true);
    q.beams.west.main.extensionMode = "custom";
    q.beams.west.main.extension = 1000;
    expect(() => estimateSlabQuantity(i, q)).toThrow("far-side");
  });
  it("is optional, retains old drafts and persists end detailing", () => {
    const { i, q } = setup();
    q.beams.east.extra.shape = "L-hook";
    expect(
      slabDraftSchema.parse({ kind: "slab", version: 1, input: i, quantity: q })
        .quantity?.beams.east.extra.shape,
    ).toBe("L-hook");
    expect(
      slabDraftSchema.parse({ kind: "slab", version: 1, input: i }).quantity,
    ).toBeUndefined();
    q.enabled = false;
    expect(estimateSlabQuantity({ ...i, lx: NaN }, q)).toBeNull();
  });
  it("recounts physical bars for clear panel dimensions and preserves design inputs", () => {
    const { i, q } = setup();
    const original = JSON.stringify(i),
      r = estimateSlabQuantity(i, q)!;
    q.clearX = 5000;
    expect(
      estimateSlabQuantity(i, q)!.rows.find((b) => b.axis === "Y")!.count,
    ).toBeGreaterThan(r.rows.find((b) => b.axis === "Y")!.count);
    expect(JSON.stringify(i)).toBe(original);
  });
});
