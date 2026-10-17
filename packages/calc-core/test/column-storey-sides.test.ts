/**
 * Storey beams N/S/E/W (17 Oct 2026). ACI 318-19 6.2.4: ℓu to the lower
 * extremity of the supporting members; user decision: the SHALLOWER support
 * in each direction governs (longer ℓu); a side without a beam = slab.
 */
import { describe, expect, it } from "vitest";
import {
  defaultColumnStorey,
  newColumnStorey,
  storeyClearHeights,
  storeyDepths,
  storeySides,
  withStoreySides,
  columnStoreySchema,
} from "../src";

const beam = (width: number, depth: number) => ({ beam: true, width, depth });
const none = { beam: false, width: 300, depth: 500 };

describe("storey sides", () => {
  it("older drafts: sides from beamX / beamY, width assumed", () => {
    const s = { ...defaultColumnStorey(), beamX: 600, beamY: 450 };
    const r = storeySides(s);
    expect(r.assumedWidth).toBe(true);
    expect(r.sides.north).toEqual(beam(300, 450)); // along Y → beamY
    expect(r.sides.east).toEqual(beam(300, 600)); // along X → beamX
    // ℓu unchanged: 3000 − 450 = 2550 (x), 3000 − 600 = 2400 (y).
    const h = storeyClearHeights(s);
    expect([h.luX, h.luY, h.joint]).toEqual([2550, 2400, 600]);
  });
  it("hand calculation: shallower support governs; none = slab thickness", () => {
    // H 3500; N 300×600, S 300×450, E none (slab 200), W 250×500; capital 0.
    const s = withStoreySides(
      { ...defaultColumnStorey(), height: 3500 },
      { north: beam(300, 600), south: beam(300, 450), east: none, west: beam(250, 500) },
      200,
    );
    expect(storeyDepths(s)).toEqual({ ns: 450, ew: 200, joint: 600 });
    // ℓu,x = 3500 − 450 = 3050; ℓu,y = 3500 − 200 = 3300; lo uses 3300.
    const h = storeyClearHeights(s);
    expect([h.derivedX, h.derivedY, h.loClear, h.joint]).toEqual([3050, 3300, 3300, 600]);
    // beamX / beamY kept in step for older consumers.
    expect([s.beamY, s.beamX]).toEqual([450, 200]);
    expect(columnStoreySchema.parse(s).sides?.east.beam).toBe(false);
  });
  it("new calculations: 300 × 500 beams all round, 150 mm slab", () => {
    const s = newColumnStorey();
    expect(storeySides(s).assumedWidth).toBe(false);
    expect(s.slabThickness).toBe(150);
    expect(storeyClearHeights(s).luX).toBe(2500);
  });
});
