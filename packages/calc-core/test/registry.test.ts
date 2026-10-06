import { describe, expect, it } from "vitest";

import { getModule, getPilotModules, moduleRegistry } from "../src";

describe("module registry", () => {
  it("contains the four approved pilot modules", () => {
    expect(getPilotModules().map((module) => module.slug)).toEqual([
      "rc-column",
      "steel-column",
      "seismic-loads",
      "soil-bearing-capacity",
    ]);
  });

  it("keeps slope stability in Foundation & Geotechnical Phase 2", () => {
    expect(getModule("slope-stability")).toMatchObject({
      discipline: "Foundation & Geotechnical",
      releasePhase: "Phase 2",
    });
  });

  it("keeps every initial module behind the interface-only safety gate", () => {
    expect(
      moduleRegistry.every(
        (module) => module.verificationStatus === "interface-only",
      ),
    ).toBe(true);
  });
});
