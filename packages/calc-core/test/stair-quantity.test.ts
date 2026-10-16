/**
 * Stairs quantities (decision U5, benchmark B4b): hand volumes.
 */
import { describe, expect, it } from "vitest";
import {
  barMassPerMetre,
  defaultStairsInput,
  stairGeometry,
  stairPitch,
  stairProfileArea,
  stairQuantities,
  type StairsInput,
} from "../src";

const straight = (): StairsInput => ({
  ...defaultStairsInput(),
  riser: 175,
  going: 275,
  waist: 150,
  bottomLanding: { length: 0, thickness: 150, width: 0 },
  topLanding: { length: 0, thickness: 150, width: 0 },
  flights: [{ risers: 10, landingAfter: null }],
  topSupport: { condition: "Sliding", bearing: 250 },
});

describe("stairs quantities (B4b)", () => {
  it("straight flight profile = N·R·T/2 + N·T·t/cosθ", () => {
    const i = straight();
    const [g] = stairGeometry(i);
    const { cos } = stairPitch(175, 275);
    const hand = (10 * 175 * 275) / 2 + 10 * 275 * (150 / cos);
    expect(stairProfileArea(g)).toBeCloseTo(hand, -2); // within ~50 mm² of ~730 000 mm²
    expect(Math.abs(stairProfileArea(g) - hand) / hand).toBeLessThan(1e-4);
  });
  it("1 m strip vs full width scales concrete, formwork and bars by B", () => {
    const strip = stairQuantities(straight());
    const full = stairQuantities({
      ...straight(),
      widthMode: "full",
      flightWidth: 1500,
    });
    expect(strip.widthM).toBe(1);
    expect(full.widthM).toBe(1.5);
    const [g] = stairGeometry(straight());
    const area = stairProfileArea(g) / 1e6;
    expect(strip.totals.concrete).toBeCloseTo(area * 1.0, 6);
    expect(full.totals.concrete).toBeCloseTo(area * 1.5, 6);
    // riser formwork: N·R·W
    const riser = (q: typeof strip) =>
      q.formwork.find((r) => r.item.includes("riser"))!.quantity;
    expect(riser(strip)).toBeCloseTo(10 * 0.175 * 1, 9);
    expect(riser(full)).toBeCloseTo(10 * 0.175 * 1.5, 9);
  });
  it("bar count across the width and mass per metre", () => {
    const q = stairQuantities({
      ...straight(),
      widthMode: "full",
      flightWidth: 1200,
    });
    const main = q.bars.find((b) => b.label === "Main bottom bars")!;
    expect(main.count).toBe(Math.floor((1200 - 40) / 150) + 1);
    expect(barMassPerMetre(12)).toBeCloseTo(0.888, 3);
    expect(main.mass).toBeCloseTo(
      main.count * (main.length / 1000) * barMassPerMetre(12),
      9,
    );
    expect(q.totals.steel).toBeCloseTo(
      q.bars.reduce((s, b) => s + b.mass, 0),
      9,
    );
  });
  it("landings use their own width in full-width mode; footing added when designed", () => {
    const base = defaultStairsInput();
    const i: StairsInput = {
      ...base,
      widthMode: "full",
      flightWidth: 1200,
      topLanding: { length: 1500, thickness: 200, width: 2400 },
      bottomSupport: {
        ...base.bottomSupport,
        onGround: true,
        footing: {
          ...base.bottomSupport.footing,
          design: true,
          width: 800,
          thickness: 300,
        },
      },
    };
    const q = stairQuantities(i);
    const top = q.concrete.find((r) => r.item.includes("Top landing"))!;
    expect(top.basis).toContain("× 2.400 m");
    const ftg = q.concrete.find((r) => r.strip === "Footing")!;
    expect(ftg.quantity).toBeCloseTo(0.8 * 0.3 * 1.2, 9);
  });
});
