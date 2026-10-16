import { describe, expect, it } from "vitest";

import { getModule, getPilotModules, moduleRegistry } from "../src";

describe("module registry", () => {
  it("contains the approved pilot modules including slab", () => {
    expect(getPilotModules().map((module) => module.slug)).toEqual([
      "slab",
      "retaining-wall",
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

  it("does not mark development modules as independently verified", () => {
    expect(
      moduleRegistry.every(
        (module) =>
          module.verificationStatus === "interface-only" ||
          module.verificationStatus === "verification-required",
      ),
    ).toBe(true);
  });
});
