import { describe, expect, it } from "vitest";
import {
  defaultStairsInput,
  stairGeometry,
  type StairsInput,
} from "@nola/calc-core";
import { buildStair3DModel } from "../src/lib/stair-3d-model";
import {
  clipPolyline,
  crossAtKnees,
  offsetPolyline,
} from "../src/lib/stair-drawing";

describe("stair 3D model", () => {
  it("extrudes the strip profile over the flight width with supports and the uniform load", () => {
    const i = defaultStairsInput();
    const m = buildStair3DModel(i);
    expect(m.solids).toHaveLength(1);
    expect(m.solids[0].z1 - m.solids[0].z0).toBeCloseTo(1.2, 9);
    const beams = m.boxes.filter((b) => b.kind === "beam");
    expect(beams).toHaveLength(2);
    // V1: beam tops flush with the finished level (bottom floor 0, top landing 10R)
    expect(beams[0].y1).toBeCloseTo(0, 9);
    expect(beams[1].y1).toBeCloseTo(1.75, 9);
    expect(beams[1].y1 - beams[1].y0).toBeCloseTo(0.5, 9);
    // V3: rebar layer for every set, bars repeated across the 1.2 m flight
    expect(m.bars.map((b) => b.set).sort()).toEqual(
      ["distribution", "mainBottom", "topBottom", "topKnee", "topTop"].sort(),
    );
    const zs = new Set(
      m.bars
        .find((b) => b.set === "mainBottom")!
        .segments.map((sg) => sg[2].toFixed(3)),
    );
    expect(zs.size).toBe(Math.floor((1.2 - 0.04) / 0.15) + 1);
    expect(m.loads[0].kind).toBe("uniform");
    expect(m.band).toHaveLength(1);
    expect(m.band![0].z1 - m.band![0].z0).toBeCloseTo(1, 9);
    expect((m.band![0].z0 + m.band![0].z1) / 2).toBeCloseTo(0.6, 9);
  });
  it("places a point load at its x on the walking surface; no band in full-width mode", () => {
    const i: StairsInput = {
      ...defaultStairsInput(),
      widthMode: "full",
      localLoads: [
        {
          kind: "point",
          id: "P1",
          strip: 1,
          case: "live",
          x: 1100,
          value: 5,
          width: 300,
        },
      ],
    };
    const m = buildStair3DModel(i);
    const p = m.loads.find((l) => l.id === "P1")!;
    expect(p.arrows[0].x).toBeCloseTo(1.1, 9);
    // at x = 1100 mm the tread is the 5th step: level 4·R… top = 5R (x past 4 goings)
    expect(p.arrows[0].y).toBeCloseTo((5 * 175) / 1000, 9);
    expect(m.band).toBeNull();
  });
  it("dog-leg: second flight mirrored beside the first, footing on ground", () => {
    const base = defaultStairsInput();
    const i: StairsInput = {
      ...base,
      stairType: "dog-leg",
      topLanding: { length: 0, thickness: 200, width: 0 },
      flights: [
        {
          risers: 9,
          landingAfter: {
            length: 1300,
            thickness: 200,
            width: 0,
            startSupport: "None",
            endSupport: "Pinned",
          },
        },
        { risers: 9, landingAfter: null },
      ],
      bottomSupport: {
        ...base.bottomSupport,
        onGround: true,
        footing: { ...base.bottomSupport.footing, design: true },
      },
    };
    const m = buildStair3DModel(i);
    expect(m.solids).toHaveLength(2);
    expect(m.solids[1].z0).toBeCloseTo(1.2 + 0.1, 9);
    expect(m.boxes.some((b) => b.kind === "footing")).toBe(true);
    expect(m.boxes.some((b) => b.label.includes("between flights"))).toBe(true);
    // each flight carries its own 1 m band on its own z range
    expect(m.band).toHaveLength(2);
    expect((m.band![1].z0 + m.band![1].z1) / 2).toBeCloseTo(1.3 + 0.6, 9);
  });
});

describe("stair drawing helpers", () => {
  it("offsets a sloped line by d normal to it", () => {
    const [a, b] = offsetPolyline(
      [
        { x: 0, y: 0 },
        { x: 300, y: 400 },
      ],
      50,
    );
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(50, 9);
    expect(a.x).toBeCloseTo(-40, 9);
    expect(b.y - a.y).toBeCloseTo(400, 9);
  });
  it("crosses bars at a re-entrant knee and clips to a zone", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1000, y: 600 },
      { x: 2000, y: 600 },
    ];
    const parts = crossAtKnees(line, -1, 300);
    expect(parts).toHaveLength(2);
    expect(parts[0][parts[0].length - 1].x).toBeGreaterThan(1000);
    expect(parts[1][0].x).toBeLessThan(1000);
    expect(crossAtKnees(line, 1, 300)).toHaveLength(1);
    const clip = clipPolyline(line, 500, 1500);
    expect(clip[0]).toEqual({ x: 500, y: 300 });
    expect(clip[clip.length - 1]).toEqual({ x: 1500, y: 600 });
    expect(stairGeometry(defaultStairsInput())[0].topRef[0]).toEqual({
      x: 0,
      y: 0,
    });
  });
});
