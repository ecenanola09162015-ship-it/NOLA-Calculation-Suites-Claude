/**
 * Design-code catalogue (decision 17 Oct 2026): concrete ACI 318-19 only,
 * steel AISC 360-22 only, loads ASCE 7-22 / 7-16 / 7-10 + NSCP 2015 with the
 * latest edition as default; everything else "Future Development".
 */
import { describe, expect, it } from "vitest";

import {
  activeDesignCodes,
  defaultDesignCode,
  designCodeCatalogue,
  designCodeLabel,
  designCodeSchema,
  type CodeDiscipline,
} from "../src";

const disciplines: CodeDiscipline[] = ["concrete", "steel", "loads"];

describe("design-code catalogue", () => {
  it("concrete: ACI 318-19 is the only selectable code and the default", () => {
    expect(activeDesignCodes("concrete")).toEqual(["ACI 318-19"]);
    expect(defaultDesignCode("concrete")).toBe("ACI 318-19");
  });

  it("concrete: listed editions are future development", () => {
    const future = designCodeCatalogue.concrete
      .filter((c) => c.status === "future")
      .map((c) => c.id);
    expect(future).toEqual([
      "ACI 318-25",
      "ACI 318-14",
      "NSCP 2015",
      "NSCP 2010",
      "BS EN 1992-1-1",
      "AS 3600",
    ]);
  });

  it("steel: AISC 360-22 is the only selectable code and the default", () => {
    expect(activeDesignCodes("steel")).toEqual(["AISC 360-22"]);
    expect(defaultDesignCode("steel")).toBe("AISC 360-22");
    expect(
      designCodeCatalogue.steel
        .filter((c) => c.status === "future")
        .map((c) => c.id),
    ).toEqual([
      "AISC 360-16",
      "NSCP 2015",
      "NSCP 2010",
      "BS EN 1993-1-1",
      "AS 4100",
      "CSA S16",
    ]);
  });

  it("loads: ASCE 7-22, 7-16, 7-10 and NSCP 2015 selectable, latest first and default", () => {
    expect(activeDesignCodes("loads")).toEqual([
      "ASCE 7-22",
      "ASCE 7-16",
      "ASCE 7-10",
      "NSCP 2015",
    ]);
    expect(defaultDesignCode("loads")).toBe("ASCE 7-22");
  });

  it("each discipline has exactly one default and it is active", () => {
    for (const d of disciplines) {
      const defaults = designCodeCatalogue[d].filter((c) => "default" in c);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]!.status).toBe("active");
    }
  });

  it("the default is the latest active edition of its family", () => {
    for (const d of disciplines) {
      const def = designCodeCatalogue[d].find((c) => "default" in c)!;
      const sameFamilyActive = designCodeCatalogue[d].filter(
        (c) => c.status === "active" && c.family === def.family,
      );
      expect(Math.max(...sameFamilyActive.map((c) => c.year))).toBe(def.year);
    }
  });

  it("ids are unique per discipline and editions within a family are newest first", () => {
    for (const d of disciplines) {
      const ids = designCodeCatalogue[d].map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      const active = designCodeCatalogue[d].filter(
        (c) => c.status === "active" && c.family === "American",
      );
      const years = active.map((c) => c.year);
      expect(years).toEqual([...years].sort((a, b) => b - a));
    }
  });

  it("schemas accept active codes only", () => {
    expect(designCodeSchema("concrete").safeParse("ACI 318-19").success).toBe(
      true,
    );
    expect(designCodeSchema("concrete").safeParse("NSCP 2015").success).toBe(
      false,
    );
    expect(designCodeSchema("steel").safeParse("AISC 360-16").success).toBe(
      false,
    );
    expect(designCodeSchema("loads").safeParse("NSCP 2015").success).toBe(true);
    expect(designCodeSchema("loads").safeParse("ASCE 7-05").success).toBe(
      false,
    );
  });

  it("labels fall back to the stored id", () => {
    expect(designCodeLabel("loads", "ASCE 7-22")).toBe("ASCE/SEI 7-22");
    expect(designCodeLabel("concrete", "Unknown")).toBe("Unknown");
  });
});
