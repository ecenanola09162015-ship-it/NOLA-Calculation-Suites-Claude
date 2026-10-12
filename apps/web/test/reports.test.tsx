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
