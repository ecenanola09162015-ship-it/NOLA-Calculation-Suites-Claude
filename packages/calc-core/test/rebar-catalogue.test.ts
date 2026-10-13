import { describe, expect, it } from "vitest";
import {
  analyzeRectangularColumn,
  defaultColumnTieDesign,
  designColumnTransverse,
  rebarDesignation,
  rebarGradeFor,
  rebarGradeLabel,
  rebarGrades,
  rebarSizeFor,
  rebarSizes,
  type RectangularColumnInput,
} from "../src";

describe("rebar catalogue", () => {
  it("PNS 49 sizes and grades match the supplied table", () => {
    expect(rebarSizes.PNS49.map((s) => s.nominal)).toEqual([
      6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40, 50,
    ]);
    expect(
      rebarGrades.PNS49.map((g) => [
        g.label,
        g.fy,
        g.fyMax ?? null,
        g.weldable,
      ]),
    ).toEqual([
      ["Grade 230", 230, null, false],
      ["Grade 280", 280, null, false],
      ["Grade 420", 420, null, false],
      ["Grade 520", 520, null, false],
      ["Grade 550", 550, null, false],
      ["Grade 280W", 280, null, true],
      ["Grade 420W", 420, 540, true],
      ["Grade 550W", 550, 675, true],
    ]);
  });
  it("ASTM sizes carry the A615 nominal areas exactly", () => {
    const n8 = rebarSizes.ASTM.find((s) => s.label === "#8")!;
    expect(n8.nominal).toBe(25.4);
    expect(n8.area).toBe(510);
    expect((Math.PI * n8.calcDiameter ** 2) / 4).toBeCloseTo(510, 9);
    expect(rebarSizes.ASTM.map((s) => s.label)).toEqual([
      "#3",
      "#4",
      "#5",
      "#6",
      "#7",
      "#8",
      "#9",
      "#10",
      "#11",
      "#14",
      "#18",
    ]);
    expect(
      rebarGrades.ASTM.filter((g) => g.weldable).map((g) => g.label),
    ).toEqual(["A706 Gr 60", "A706 Gr 80"]);
  });
  it("designations and custom detection", () => {
    expect(rebarDesignation("PNS49", 25)).toBe("D25");
    expect(rebarDesignation("ASTM", rebarSizes.ASTM[5]!.calcDiameter)).toBe(
      "#8",
    );
    expect(rebarDesignation("PNS49", 23.5)).toBe("Ø23.5 (custom)");
    expect(rebarSizeFor("PNS49", 22)).toBeNull();
    // Old drafts without a grade id map to the non-weldable grade.
    expect(rebarGradeFor("PNS49", 420)?.label).toBe("Grade 420");
    expect(rebarGradeFor("PNS49", 420, "PNS-420W")?.label).toBe("Grade 420W");
    // An id whose fy was edited is treated as custom.
    expect(rebarGradeFor("PNS49", 430, "PNS-420W")).toBeNull();
    expect(rebarGradeLabel("PNS49", 415)).toBe("fy 415 MPa (custom)");
  });
  it("ASTM areas flow into the section steel area", () => {
    const n8 = rebarSizes.ASTM.find((s) => s.label === "#8")!.calcDiameter;
    const input: RectangularColumnInput = {
      code: "ACI 318-19",
      width: 500,
      depth: 500,
      fc: 28,
      fy: 420,
      es: 200000,
      cover: 40,
      tieDiameter: 10,
      rebarStandard: "ASTM",
      gradeId: "A706-60",
      bars: [
        [-180, -180],
        [180, -180],
        [180, 180],
        [-180, 180],
      ].map(([x, y]) => ({ x: x!, y: y!, diameter: n8 })),
      loads: [
        { id: "U1", description: "", pu: 1000, mx: 50, my: 0, included: true },
      ],
    };
    expect(analyzeRectangularColumn(input).steelArea).toBeCloseTo(4 * 510, 6);
  });
});

describe("SMF weldable longitudinal bars (ACI 318-19 20.2.2.5)", () => {
  const face = [-187.5, -62.5, 62.5, 187.5];
  const base: RectangularColumnInput = {
    code: "ACI 318-19",
    width: 500,
    depth: 500,
    fc: 28,
    fy: 420,
    es: 200000,
    cover: 40,
    tieDiameter: 10,
    bars: [
      ...face.flatMap((x) =>
        [-187.5, 187.5].map((y) => ({ x, y, diameter: 25 })),
      ),
      ...[-62.5, 62.5].flatMap((y) =>
        [-187.5, 187.5].map((x) => ({ x, y, diameter: 25 })),
      ),
    ],
    loads: [
      {
        id: "U1",
        description: "",
        pu: 1500,
        mx: 100,
        my: 50,
        vx: 0,
        vy: 100,
        included: true,
      },
    ],
  };
  const t = defaultColumnTieDesign(base, 3000);
  const smf = {
    ...t,
    confinement: { ...t.confinement, enabled: true, frame: "SMF" as const },
  };
  const grade = (input: RectangularColumnInput) =>
    designColumnTransverse(input, smf).checks.find((c) => c.id === "smf:grade");
  it("flags non-weldable Grade 420 for engineering judgment", () => {
    const c = grade({ ...base, gradeId: "PNS-420" })!;
    expect(c.dcr).toBe(1.05);
    expect(c.clause).toBe("ACI 318-19 20.2.2.5");
  });
  it("passes Grade 420W and A706 Gr 60 with a note", () => {
    expect(grade({ ...base, gradeId: "PNS-420W" })).toBeUndefined();
    const d = designColumnTransverse(
      { ...base, rebarStandard: "ASTM", gradeId: "A706-60" },
      smf,
    );
    expect(d.checks.some((c) => c.id === "smf:grade")).toBe(false);
    expect(d.notes.join(" ")).toContain("A706 Gr 60 are weldable");
  });
  it("marks a custom fy as not evaluated", () => {
    expect(grade({ ...base, fy: 415, gradeId: null })!.dcr).toBeNull();
  });
  it("does not apply to IMF or OMF", () => {
    const imf = {
      ...smf,
      confinement: { ...smf.confinement, frame: "IMF" as const },
    };
    expect(
      designColumnTransverse({ ...base, gradeId: "PNS-420" }, imf).checks.some(
        (c) => c.id === "smf:grade",
      ),
    ).toBe(false);
  });
});
