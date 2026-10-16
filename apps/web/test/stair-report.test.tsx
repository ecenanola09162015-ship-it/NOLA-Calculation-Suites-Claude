import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  analyzeStairs,
  defaultDesignCheckPolicy,
  defaultStairsInput,
  type StairsInput,
} from "@nola/calc-core";
import { generateCalculationPdf } from "../src/lib/reports/pdf";
import { stairsReportData } from "../src/lib/reports/stair-data";
import { standaloneSvg } from "../src/lib/reports/stair-figures";
import { StairPlan } from "../src/components/stair-diagrams";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const dogLeg = (): StairsInput => {
  const base = defaultStairsInput();
  return {
    ...base,
    stairType: "dog-leg",
    widthMode: "full",
    flightWidth: 1500,
    topLanding: { length: 1200, thickness: 200, width: 0 },
    flights: [
      {
        risers: 10,
        landingAfter: {
          length: 1200,
          thickness: 200,
          width: 0,
          startSupport: "None",
          endSupport: "Pinned",
        },
      },
      { risers: 10, landingAfter: null },
    ],
    bottomSupport: {
      ...base.bottomSupport,
      onGround: true,
      footing: { ...base.bottomSupport.footing, design: true },
    },
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
};
const build = (i: StairsInput, estimate: boolean) => {
  const r = analyzeStairs(i);
  const data = stairsReportData(
    undefined,
    "ST-01",
    i,
    r,
    defaultDesignCheckPolicy,
    {},
    estimate,
    png,
  );
  for (const f of data.figures) f.png = png;
  return { r, data };
};

describe("stairs PDF report (R1, R2)", () => {
  it("lists every check under its flight heading with a clause, and governing rows for the simple report", () => {
    const { r, data } = build(dogLeg(), false);
    expect(data.module).toBe("Stairs");
    expect(data.basis).toBe("ACI 318-19");
    expect(data.checks.rows).toHaveLength(r.checks.length);
    expect(String(data.checks.rows[0][0])).toMatch(/^Flight 1 · /);
    expect(
      data.checks.rows.some((row) => String(row[0]).startsWith("Flight 2 · ")),
    ).toBe(true);
    expect(
      data.checks.rows.some((row) =>
        String(row[0]).startsWith("Foundation · "),
      ),
    ).toBe(true);
    expect(data.checks.simpleRows!.length).toBeLessThan(
      data.checks.rows.length,
    );
    for (const row of data.checks.rows)
      expect(String(row[1]).length).toBeGreaterThan(5);
    expect(data.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        "Calculations · Flight 1",
        "Calculations · Flight 2",
        "Strip Footing",
      ]),
    );
    expect(data.estimate).toBeUndefined();
    // exceeded checks name their condition instead of "Not Evaluated"
    const inf = r.checks.find((c) => c.dcr === Infinity);
    if (inf)
      expect(JSON.stringify(data.checks.rows)).toContain(
        inf.invalidLabel ?? "Exceeds Capacity",
      );
    // the stairs text is mapped to the PDF font set
    const all = JSON.stringify([
      data.summary,
      data.checks,
      data.sections,
      data.limitations,
    ]);
    expect(all).not.toMatch(/[−γμ≈]/);
  });
  it("adds the estimate and bar schedule only when enabled", () => {
    const { data } = build(dogLeg(), true);
    expect(data.estimate?.title).toBe("Quantity Estimate");
    expect(data.sections.some((s) => s.title === "Bar Schedule")).toBe(true);
  });
  it.each(["A4", "Letter"] as const)(
    "simple report fits two pages; complete report renders (%s)",
    async (paper) => {
      for (const i of [defaultStairsInput(), dogLeg()]) {
        const { data } = build(i, true);
        const simple = await generateCalculationPdf(data, {
          type: "simple",
          paper,
          nolaLogo: png,
        });
        const doc = await PDFDocument.load(simple.bytes);
        expect(doc.getPageCount()).toBeLessThanOrEqual(2);
        const complete = await generateCalculationPdf(data, {
          type: "complete",
          paper,
          nolaLogo: png,
        });
        expect(complete.pageCount).toBeGreaterThan(doc.getPageCount() - 1);
        expect(complete.warnings ?? []).toEqual([]);
      }
    },
  );
  it("renders standalone figure SVG with size, namespace and no CSS classes", () => {
    const svg = standaloneSvg(
      <StairPlan input={defaultStairsInput()} bare />,
      600,
    );
    expect(
      svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600"'),
    ).toBe(true);
    expect(svg).not.toContain('class="');
    expect(svg).toContain('fill="#ffffff"');
    const { data } = build(dogLeg(), false);
    expect(data.figures.map((f) => f.title)).toEqual([
      "Dog-Leg Elevation (Flight 1 Front, Flight 2 Behind)",
      "Section · Flight 1 strip (Bars B1 / T1–T3 / D1)",
      "Section · Flight 2 strip (Bars B1 / T1–T3 / D1)",
      "Plan · Bottom Layer And Top-Bar Zones",
      "Factored Envelopes · Flight 1 strip",
      "Factored Envelopes · Flight 2 strip",
      "3D View With Supports And Loads (snapshot)",
    ]);
    expect(data.figures.filter((f) => !f.completeOnly)).toHaveLength(3);
  });
});
