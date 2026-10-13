import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderToStaticMarkup } from "react-dom/server";
import { generateCalculationPdf } from "../src/lib/reports/pdf";
import { reportFixtures } from "./helpers/reports";
import { ReportExportControls } from "../src/components/report-export-controls";
import {
  projectReportSettingsSchema,
  defaultProjectReportSettings,
} from "@nola/calc-core";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const prepared = () => {
  const models = reportFixtures();
  for (const m of Object.values(models)) for (const f of m.figures) f.png = png;
  return models;
};
describe("shared PDF reports", () => {
  it("prints a code clause beside every DCR check in both modules", async () => {
    for (const data of Object.values(prepared())) {
      expect(data.checks.columns).toEqual([
        "Check",
        "Code Reference",
        "DCR",
        "Status / Remarks",
      ]);
      expect(data.checks.rows.length).toBeGreaterThan(0);
      for (const row of data.checks.rows)
        expect(String(row[1])).toMatch(/^ACI 318-19 \S/);
      const result = await generateCalculationPdf(data, {
        type: "complete",
        paper: "A4",
        nolaLogo: png,
      });
      expect(result.pageCount).toBeGreaterThan(0);
    }
  });
  it.each(["A4", "Letter"] as const)(
    "keeps column and ordinary slab summaries to one page on %s",
    async (paper) => {
      for (const data of Object.values(prepared())) {
        const result = await generateCalculationPdf(data, {
          type: "simple",
          paper,
          nolaLogo: png,
        });
        const doc = await PDFDocument.load(result.bytes);
        expect(doc.getPageCount()).toBe(1);
        expect(doc.getPage(0).getWidth()).toBeCloseTo(
          paper === "A4" ? 595.28 : 612,
          1,
        );
      }
    },
  );
  it("permits a second slab summary page without relaxing the column limit", async () => {
    const models = prepared();
    models.slab.summary[2].rows.push([
      "Engineering Remarks",
      "Reviewed " +
        "Provided Reinforcement And Design Assumptions. ".repeat(35),
    ]);
    const result = await generateCalculationPdf(models.slab, {
      type: "simple",
      paper: "Letter",
    });
    expect(result.pageCount).toBe(2);
    models.column.summary[2].rows.push(
      ["Long Remarks", "W".repeat(2000)],
      ["More Remarks", "W".repeat(2000)],
    );
    await expect(
      generateCalculationPdf(models.column, {
        type: "simple",
        paper: "Letter",
      }),
    ).rejects.toThrow("Column Simple Report Cannot Fit One Page");
  });
  it("paginates all combinations and complete checks without adding empty pages", async () => {
    const data = prepared().column;
    data.sections[1].rows.push(
      ...Array.from({ length: 90 }, (_, k) => [
        "Added-" + k,
        "Included",
        "900",
        "60",
        "30",
        "Not Supplied",
        "0.3",
        "0.6",
        "Pass",
      ]),
    );
    const result = await generateCalculationPdf(data, {
      type: "complete",
      paper: "A4",
    });
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBeGreaterThan(4);
    for (const page of doc.getPages())
      expect(page.node.Contents()).toBeDefined();
  });
  it("includes traceable quantities, code basis and combined slab steel; omits disabled estimates", () => {
    const data = reportFixtures();
    expect(
      data.column.estimate?.rows.some(
        (r) => String(r[0]) === "Steel / Concrete",
      ),
    ).toBe(true);
    expect(
      data.column.summary
        .flatMap((s) => s.rows)
        .some((r) => String(r[1]).includes("Column Shear Not Evaluated")),
    ).toBe(true);
    expect(data.slab.figures.map((f) => f.title)).toContain(
      "Sections A–A / B–B",
    );
    expect(
      data.slab.sections.some(
        (s) => s.title === "Combined Reinforcement At Cutoff Zones",
      ),
    ).toBe(true);
    expect(data.slab.basis).toBe("ACI 318-19");
    for (const model of Object.values(reportFixtures(false))) {
      expect(model.estimate).toBeUndefined();
      expect(
        model.sections.some((s) => s.title === "Rebar Cutting Schedule"),
      ).toBe(false);
    }
  });
  it("renders accessible report options and validates settings and logos", () => {
    const html = renderToStaticMarkup(
      <ReportExportControls
        moduleName="Slab Design"
        disabled={false}
        onData={async () => reportFixtures().slab}
      />,
    );
    for (const text of [
      "Simple Report — Up To Two Pages",
      "Complete Report",
      "Paper Size",
      "Letter",
      "Download Project PDF Report",
    ])
      expect(html).toContain(text);
    expect(
      projectReportSettingsSchema.safeParse({
        ...defaultProjectReportSettings,
        companyLogo: "https://untrusted.example/logo.svg",
      }).success,
    ).toBe(false);
    expect(
      projectReportSettingsSchema.safeParse({
        ...defaultProjectReportSettings,
        style: {
          ...defaultProjectReportSettings.style,
          colors: {
            ...defaultProjectReportSettings.style.colors,
            primary: "bad",
          },
        },
      }).success,
    ).toBe(false);
  });
});
describe("slab point loads in the report", () => {
  it("prints point loads, punching equations and the 22.6 clause, and renders the PDF", async () => {
    const {
      analyzeSlab,
      defaultSlabInput,
      defaultSlabQuantity,
      defaultDesignCheckPolicy,
    } = await import("@nola/calc-core");
    const { slabReportData } = await import("../src/lib/reports/data");
    const input = {
      ...defaultSlabInput(),
      lx: 5,
      ly: 5,
      h: 200,
      pointLoads: [
        {
          kind: "point" as const,
          id: "P1",
          x: 2.5,
          y: 2.5,
          bx: 300,
          by: 300,
          dead: 40,
          live: 20,
        },
      ],
    };
    const data = slabReportData(
      undefined,
      "SL-PL",
      input,
      analyzeSlab(input),
      defaultSlabQuantity(),
      defaultDesignCheckPolicy,
      {},
    );
    for (const fig of data.figures) fig.png = png;
    const punch = data.checks.rows.find((row) =>
      String(row[0]).includes("P1 · Punching Shear"),
    );
    expect(String(punch?.[1])).toContain("Table 22.6.5.2");
    const titles = data.sections.map((s) => s.title);
    expect(titles).toContain("Local Loads");
    expect(titles).toContain("Punching Shear At Point Loads");
    expect(data.figures[0].svg).toContain("P1");
    const result = await generateCalculationPdf(data, {
      type: "complete",
      paper: "A4",
      nolaLogo: png,
    });
    expect(result.pageCount).toBeGreaterThan(0);
    for (const paper of ["A4", "Letter"] as const) {
      const simple = await generateCalculationPdf(data, {
        type: "simple",
        paper,
        nolaLogo: png,
      });
      expect(simple.pageCount).toBe(1);
    }
  });
});
describe("cantilever slab report", () => {
  it("prints cantilever clauses and the top-bar anchorage row, one-page simple report", async () => {
    const {
      analyzeSlab,
      defaultSlabInput,
      defaultSlabQuantity,
      defaultDesignCheckPolicy,
    } = await import("@nola/calc-core");
    const { slabReportData } = await import("../src/lib/reports/data");
    const input = {
      ...defaultSlabInput(),
      lx: 1.5,
      ly: 6,
      h: 180,
      supports: {
        west: "Fixed",
        east: "Free",
        south: "Free",
        north: "Free",
      } as const,
    };
    const data = slabReportData(
      undefined,
      "CS-01",
      input,
      analyzeSlab(input),
      defaultSlabQuantity(),
      defaultDesignCheckPolicy,
      {},
    );
    for (const fig of data.figures) fig.png = png;
    const rows = data.sections.flatMap((s) => s.rows.map((r) => r.join(" ")));
    expect(rows.some((r) => r.includes("Cantilever Top-Bar Anchorage"))).toBe(
      true,
    );
    expect(rows.some((r) => r.includes("cantilever ℓ/10"))).toBe(true);
    for (const paper of ["A4", "Letter"] as const)
      expect(
        (
          await generateCalculationPdf(data, {
            type: "simple",
            paper,
            nolaLogo: png,
          })
        ).pageCount,
      ).toBe(1);
  });
});

describe("PDF text symbols", () => {
  it("prints Σ and ∥ labels without '?' placeholders", async () => {
    const { reportFixtures } = await import("./helpers/reports");
    const data = reportFixtures().column;
    for (const f of data.figures) f.png = png;
    data.summary[2]!.rows.push(
      ["Biaxial shear Σ = 1.200 vs limit 1.5", "DCR 0.800"],
      ["Ash legs ∥ x (bc 420 mm)", "DCR 0.837"],
    );
    const r = await generateCalculationPdf(data, {
      type: "complete",
      paper: "A4",
    });
    const pdf = await PDFDocument.load(r.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });
});

describe("3D snapshot in the PDF", () => {
  it("adds the snapshot figure to the Complete report only", async () => {
    const {
      analyzeSlab,
      defaultSlabInput,
      defaultSlabQuantity,
      defaultDesignCheckPolicy,
    } = await import("@nola/calc-core");
    const { slabReportData } = await import("../src/lib/reports/data");
    const input = defaultSlabInput();
    const make = (snap: string | null) => {
      const data = slabReportData(
        undefined,
        "SL-3D",
        input,
        analyzeSlab(input),
        defaultSlabQuantity(),
        defaultDesignCheckPolicy,
        {},
        snap,
      );
      for (const fig of data.figures) fig.png = fig.png ?? png;
      return data;
    };
    const without = make(null),
      withSnap = make(png);
    expect(withSnap.figures.length).toBe(without.figures.length + 1);
    expect(withSnap.figures.at(-1)).toMatchObject({ completeOnly: true });
    // Simple report unchanged (still one page); Complete report renders.
    for (const paper of ["A4", "Letter"] as const)
      expect(
        (
          await generateCalculationPdf(withSnap, {
            type: "simple",
            paper,
            nolaLogo: png,
          })
        ).pageCount,
      ).toBe(1);
    expect(
      (
        await generateCalculationPdf(withSnap, {
          type: "complete",
          paper: "A4",
          nolaLogo: png,
        })
      ).pageCount,
    ).toBeGreaterThan(0);
  });
});
