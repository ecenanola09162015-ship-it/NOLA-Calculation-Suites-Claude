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

  it("lists Steel modules with connections before base plate and sheet piles last", () => {
    expect(
      uiCatalogue.filter((m) => m.group === "Steel").map((m) => m.name),
    ).toEqual([
      "Steel Column",
      "Steel Beam",
      "Beam to Column Connection",
      "Beam to Beam Connection",
      "Base Plate",
      "Purlins",
      "Sheet Pile Retaining Wall",
    ]);
  });

  it("puts Borehole Logs and Data first under Geotechnical", () => {
    expect(
      uiCatalogue.find((m) => m.group === "Geotechnical")?.slug,
    ).toBe("borehole-logs");
  });

  it("uses unique slugs", () => {
    const slugs = uiCatalogue.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
