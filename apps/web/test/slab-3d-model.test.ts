import { describe, expect, it } from "vitest";
import { defaultSlabInput } from "@nola/calc-core";
import {
  buildSlab3DModel,
  watercolorConcretePixels,
} from "../src/lib/slab-3d-model";

const lc = [
  {
    id: "LC1",
    deadFactor: 1.2,
    liveFactor: 1.6,
    serviceLiveFactor: 1,
    included: true,
  },
  {
    id: "LC2",
    deadFactor: 1.4,
    liveFactor: 0,
    serviceLiveFactor: 1,
    included: true,
  },
];
describe("3D slab scene model", () => {
  const input = {
    ...defaultSlabInput(),
    lx: 6,
    ly: 4.5,
    h: 150,
    loads: lc,
    supports: {
      west: "Fixed",
      east: "Pinned",
      south: "Fixed",
      north: "Free",
    } as const,
    pointLoads: [
      {
        kind: "point" as const,
        id: "P1",
        x: 4.5,
        y: 1.2,
        bx: 300,
        by: 300,
        dead: 20,
        live: 10,
      },
      {
        kind: "line" as const,
        id: "W1",
        x: 0,
        y: 3,
        direction: "X" as const,
        length: 4,
        thickness: 150,
        dead: 6,
        live: 0,
      },
      {
        kind: "area" as const,
        id: "A1",
        x: 2,
        y: 1.3,
        bx: 2000,
        by: 1600,
        dead: 3,
        live: 2,
      },
    ],
  };
  const m = buildSlab3DModel(input);
  it("uses true scale; beams on Fixed and Pinned edges, none on Free; flush ring", () => {
    expect(m.slab).toEqual({ lx: 6, ly: 4.5, h: 0.15 });
    // Default 250 x 500 beams outside the clear panel; north is Free (no beam).
    expect(m.footprint).toEqual({ x0: -0.25, x1: 6.25, y0: -0.25, y1: 4.5 });
    expect(m.supports.map((s) => s.id)).toEqual([
      "west",
      "east",
      "south",
      "west-south",
      "east-south",
    ]);
    // Downstand below the soffit: 500 − 150 = 350 mm; top flush (slab body covers the beam top).
    const west = m.supports[0].box;
    expect(west).toEqual({
      x0: -0.25,
      x1: 0,
      y0: 0,
      y1: 4.5,
      z0: -0.35,
      z1: 0,
    });
    expect(m.supports[0]).toMatchObject({
      kind: "Fixed",
      size: { width: 250, depth: 500 },
    });
    expect(m.supports[1]).toMatchObject({ kind: "Pinned" });
    // Beam next to the Free north edge stops at the slab edge (no corner piece).
    expect(m.supports.some((s) => s.id.includes("north"))).toBe(false);
  });
  it("takes Estimate beam sizes per edge; corner fills to the deeper beam", () => {
    const est = buildSlab3DModel({
      ...input,
      beams: {
        source: "estimate",
        sizes: {
          west: { width: 300, depth: 600 },
          east: { width: 250, depth: 500 },
          south: { width: 400, depth: 700 },
          north: { width: 250, depth: 500 },
        },
      },
    });
    expect(est.footprint).toEqual({ x0: -0.3, x1: 6.25, y0: -0.4, y1: 4.5 });
    const corner = est.supports.find((s) => s.id === "west-south")!.box;
    // x −0.3..0, y −0.4..0, soffit at the deeper beam: 700 − 150 = 550 mm
    expect(corner).toMatchObject({ x0: -0.3, x1: 0, y0: -0.4, y1: 0, z1: 0 });
    expect(corner.z0).toBeCloseTo(-0.55, 12);
  });
  it("places loads at their coordinates with type colours and governing factored labels", () => {
    const [p, w, a] = m.loads;
    expect(p.color).toBe("#c0392b");
    expect(w.color).toBe("#1f5fbf");
    expect(a.color).toBe("#2e8b3e");
    // P1: max(1.2·20 + 1.6·10, 1.4·20) = max(40, 28) = 40 kN (LC1)
    expect([p.factored, p.unit, p.combination]).toEqual([40, "kN", "LC1"]);
    expect(p.label).toBe("P1 · 40.0 kN (LC1)");
    expect(p.arrows).toEqual([{ x: 4.5, y: 1.2, length: m.arrowReference }]);
    // W1: max(7.2, 8.4) = 8.4 kN/m (LC2); arrows along X from 0 to 4 m at y = 3
    expect([w.factored, w.unit, w.combination]).toEqual([
      expect.closeTo(8.4, 12),
      "kN/m",
      "LC2",
    ]);
    expect(w.arrows[0]).toMatchObject({ x: 0, y: 3 });
    expect(w.arrows.at(-1)).toMatchObject({ x: 4, y: 3 });
    // A1: max(1.2·3 + 1.6·2, 1.4·3) = max(6.8, 4.2) = 6.8 kPa; arrows inside footprint
    expect([a.factored, a.unit]).toEqual([expect.closeTo(6.8, 12), "kPa"]);
    expect(a.footprint).toEqual({ x0: 1, x1: 3, y0: 0.5, y1: 2.1 });
    for (const arrow of a.arrows) {
      expect(arrow.x).toBeGreaterThan(1);
      expect(arrow.x).toBeLessThan(3);
    }
  });
  it("scales arrows with factored intensity within each load type (min 35 %)", () => {
    const two = buildSlab3DModel({
      ...input,
      pointLoads: [
        {
          kind: "point",
          id: "P1",
          x: 1,
          y: 1,
          bx: 300,
          by: 300,
          dead: 100,
          live: 0,
        },
        {
          kind: "point",
          id: "P2",
          x: 2,
          y: 1,
          bx: 300,
          by: 300,
          dead: 50,
          live: 0,
        },
        {
          kind: "point",
          id: "P3",
          x: 3,
          y: 1,
          bx: 300,
          by: 300,
          dead: 5,
          live: 0,
        },
      ],
    });
    const len = two.loads.map((l) => l.arrows[0].length / two.arrowReference);
    expect(len[0]).toBeCloseTo(1, 12);
    expect(len[1]).toBeCloseTo(0.5, 12);
    expect(len[2]).toBeCloseTo(0.35, 12);
  });
});
describe("watercolour concrete texture", () => {
  it("is deterministic, opaque, mid-to-light grey with visible variation", () => {
    const a = watercolorConcretePixels(64, 7),
      b = watercolorConcretePixels(64, 7);
    expect(a).toEqual(b);
    let min = 255,
      max = 0,
      sum = 0;
    for (let k = 0; k < 64 * 64; k++) {
      expect(a[k * 4 + 3]).toBe(255);
      const g = (a[k * 4] + a[k * 4 + 1] + a[k * 4 + 2]) / 3;
      min = Math.min(min, g);
      max = Math.max(max, g);
      sum += g;
    }
    expect(sum / 4096).toBeGreaterThan(150);
    expect(sum / 4096).toBeLessThan(225);
    expect(max - min).toBeGreaterThan(25);
  });
});
