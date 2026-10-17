/** Strong column–weak beam removed for now (user decision 18 Oct 2026). */
import { describe, expect, it } from "vitest";
import {
  defaultColumnTieDesign,
  designColumnTransverse,
  type RectangularColumnInput,
} from "../src";

const input: RectangularColumnInput = {
  code: "ACI 318-19", width: 600, depth: 600, fc: 34.5, fy: 420, es: 200000, cover: 40, tieDiameter: 12,
  bars: [-237.5, 237.5].flatMap((x) => [-237.5, 237.5].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U", description: "", pu: 2000, mx: 150, my: 80, vx: 300, vy: 300, included: true }],
};

describe("SCWB", () => {
  it("no 18.7.3.2 check even when an older draft carries ΣMnb; a note says to verify", () => {
    const base = defaultColumnTieDesign(input, 2500);
    const t = designColumnTransverse(input, {
      ...base,
      confinement: { ...base.confinement, enabled: true, frame: "SMF", sumMnbX: 900, sumMnbY: 700 },
    });
    expect(t.checks.some((c) => c.id.startsWith("smf:scwb"))).toBe(false);
    expect(t.notes.join(" ")).toContain("Strong column–weak beam (ACI 318-19 18.7.3.2");
  });
});
