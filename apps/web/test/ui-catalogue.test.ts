import { describe, expect, it } from "vitest";
import { uiCatalogue } from "../src/lib/ui-catalogue";

describe("launcher catalogue", () => {
  it("lists Loads modules in planning order", () => {
    expect(
      uiCatalogue.filter((m) => m.group === "LOADS").map((m) => m.name),
    ).toEqual([
      "Gravity Load Planner",
      "Load Combination Planner",
      "Seismic Loads",
      "Wind Loads",
    ]);
  });

  it("uses unique slugs", () => {
    const slugs = uiCatalogue.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
