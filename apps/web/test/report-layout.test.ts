/**
 * PDF summary layout and the Column Simple report contents.
 *
 * Fault fixed (14 Oct 2026 report C4): the summary was drawn as three fixed
 * one-third-width boxes; the 4th table (Shear And Confinement Design, SMF)
 * was placed past the right margin and clipped across two pages.
 * Geometry is checked by recording every rectangle and text pdf-lib draws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFPage, type PDFFont } from "pdf-lib";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnSlenderness,
  defaultColumnStorey,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  defaultProjectReportSettings,
  designColumnTransverse,
  type ColumnTieDesignInput,
  type DesignCheck,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  columnReportData,
  governingTransverseRows,
  type ReportData,
  type ReportSection,
} from "../src/lib/reports/data";
import {
  generateCalculationPdf,
  ReportTooLongError,
  summaryRows,
  SUMMARY_SIDE_BY_SIDE_ROWS,
} from "../src/lib/reports/pdf";
import { reportFixtures } from "./helpers/reports";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ReportExportControls } from "../src/components/report-export-controls";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

/** Full-option column: SMF confinement, shear, slenderness, storey, estimate, overrides. */
function fullOption(): ReportData {
  const input: RectangularColumnInput = {
    code: "ACI 318-19",
    width: 600,
    depth: 800,
    fc: 28,
    fy: 420,
    es: 200000,
    cover: 40,
    tieDiameter: 10,
    bars: [-245, -82, 82, 245].flatMap((x) =>
      [-345, -115, 115, 345].map((y) => ({ x, y, diameter: 25 })),
    ),
    loads: [
      { id: "LC1", description: "Gravity", pu: 2400, mx: 250, my: 120, vx: 400, vy: 400, included: true },
      { id: "LC2", description: "Seismic", pu: 1800, mx: 420, my: 260, vx: 400, vy: 400, included: true },
    ],
    slenderness: { ...defaultColumnSlenderness(3000), enabled: true },
    storey: { ...defaultColumnStorey(), height: 3000, beamX: 500, beamY: 500, luOverrideX: 2400 },
  };
  const base = defaultColumnTieDesign(input, 2900);
  const tie: ColumnTieDesignInput = {
    ...base,
    shear: { enabled: true },
    confinement: { ...base.confinement, enabled: true, frame: "SMF", sumMnbX: 500, sumMnbY: 400 },
    tie: { ...base.tie, interiorX: 2, interiorY: 2 },
    override: { ...base.override, lo: 700 },
  };
  const quantity = { ...defaultColumnQuantity(10), enabled: true };
  const data = columnReportData(
    { ...reportFixtures().column.project! },
    "C4 Ground Floor",
    input,
    analyzeRectangularColumn(input),
    quantity,
    defaultDesignCheckPolicy,
    {},
    tie,
    designColumnTransverse(input, tie),
  );
  for (const f of [...data.figures, ...(data.completeFigures ?? [])]) f.png = png;
  return data;
}

type Box = { page: number; x: number; y: number; w: number; h: number; border: boolean };
type Text = { page: number; x: number; w: number; text: string };
let boxes: Box[] = [],
  texts: Text[] = [];
const pageIds = new Map<PDFPage, number>();
const id = (p: PDFPage) => {
  if (!pageIds.has(p)) pageIds.set(p, pageIds.size);
  return pageIds.get(p)!;
};
beforeEach(() => {
  boxes = [];
  texts = [];
  pageIds.clear();
  const rect = PDFPage.prototype.drawRectangle;
  vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (
    this: PDFPage,
    o = {},
  ) {
    boxes.push({
      page: id(this),
      x: o.x ?? 0,
      y: o.y ?? 0,
      w: o.width ?? 0,
      h: o.height ?? 0,
      border: !!o.borderColor,
    });
    return rect.call(this, o);
  });
  const text = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (
    this: PDFPage,
    s: string,
    o = {},
  ) {
    const font = o.font as PDFFont;
    texts.push({
      page: id(this),
      x: o.x ?? 0,
      w: font.widthOfTextAtSize(s, o.size ?? 10),
      text: s,
    });
    return text.call(this, s, o);
  });
});
afterEach(() => vi.restoreAllMocks());

const margin = (defaultProjectReportSettings.style.marginMm * 72) / 25.4;
const pageWidth = { A4: 595.28, Letter: 612 } as const;

describe("summary layout: every table inside the page, none overlapping", () => {
  for (const type of ["complete", "simple"] as const)
    for (const paper of ["A4", "Letter"] as const)
      it(`${type} / ${paper}`, async () => {
        const data = fullOption();
        const pdf = await generateCalculationPdf(data, { type, paper, nolaLogo: png });
        const right = pageWidth[paper] - margin;
        // 1. Every rectangle and every text line within the margins.
        for (const b of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(margin - 0.5);
          expect(b.x + b.w).toBeLessThanOrEqual(right + 0.5);
        }
        for (const t of texts) expect(t.x + t.w).toBeLessThanOrEqual(right + 0.5);
        // 2. Table cells on the same page never overlap.
        for (let p = 0; p < pdf.pageCount; p++) {
          const cells = boxes.filter((b) => b.page === p && b.border && b.w < right);
          for (let i = 0; i < cells.length; i++)
            for (let j = i + 1; j < cells.length; j++) {
              const a = cells[i]!,
                b = cells[j]!;
              const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
              const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
              expect(ox > 0.6 && oy > 0.6, `cells overlap on page ${p + 1}`).toBe(false);
            }
        }
        // 3. The Shear And Confinement table is full width; its last row prints.
        const shear = data.summary.find((s) => s.title.startsWith("Shear And Confinement"))!;
        const rows = type === "simple" ? shear.simpleRows! : shear.rows;
        const last = String(rows[rows.length - 1]![0]);
        const printed = texts.map((t) => t.text).join(" ");
        expect(printed).toContain(last.split(" ").slice(-2).join(" "));
        const bar = texts.find((t) => t.text.startsWith("Shear And Confinement"))!;
        expect(bar.x).toBeLessThan(margin + 10); // starts at the left margin
        if (type === "simple") expect(pdf.pageCount).toBeLessThanOrEqual(3);
      });
});

describe("summary grouping (pure)", () => {
  const s = (title: string, n: number, columns = ["Item", "Value"]): ReportSection => ({
    title,
    columns,
    rows: Array.from({ length: n }, (_, k) => [`r${k}`, "v"]),
  });
  it("short tables share rows of up to three; long tables stand alone", () => {
    const rows = summaryRows([
      s("A", 3),
      s("B", 6),
      s("C", 8),
      s("D", SUMMARY_SIDE_BY_SIDE_ROWS + 1),
      s("E", 2),
      s("F", 0),
    ]);
    expect(rows.map((r) => r.map((x) => x.title))).toEqual([["A", "B", "C"], ["D"], ["E"]]);
    expect(summaryRows([s("W", 2, ["a", "b", "c"])]).map((r) => r.length)).toEqual([1]);
  });
});

describe("Column Simple report contents", () => {
  it("one governing row per group; amber and red always kept (hand check)", () => {
    const c = (id: string, dcr: number): DesignCheck => ({ id, label: id, dcr, clause: "" });
    const checks = [
      c("tie:shear:end:x", 0.42),
      c("tie:shear:end:y", 0.61), // governs Shear
      c("tie:shear:mid:x", 0.3),
      c("tie:ties:spacing-end", 0.95), // dropped
      c("tie:ties:spacing-mid", 1.03), // amber (1.00 < DCR ≤ 1.05): kept
      c("tie:ties:lo", Infinity), // red, governs Spacing / lo
      c("tie:ash:x", 0.8),
      c("tie:ash:y", 0.9), // governs Ash
      c("tie:smf:grade", Infinity), // red: kept
    ];
    const kept = governingTransverseRows(checks, defaultDesignCheckPolicy).map((r) => r.check.id);
    expect(kept).toEqual([
      "tie:shear:end:y",
      "tie:ties:spacing-mid",
      "tie:ties:lo",
      "tie:ash:y",
      "tie:smf:grade",
    ]);
  });
  it("Simple: no storey row or figure, grouped checks, 3-row estimate; Complete keeps all", async () => {
    const data = fullOption();
    const shear = data.summary.find((s) => s.title.startsWith("Shear And Confinement"))!;
    expect(shear.simpleRows!.length).toBeLessThan(shear.rows.length);
    expect(shear.simpleRows!.length).toBeLessThanOrEqual(2 + 8 + 4);
    const section = data.summary.find((s) => s.title === "Section And Reinforcement")!;
    expect(section.rows.some((r) => r[0] === "Storey Geometry")).toBe(true);
    expect(section.simpleRows!.some((r) => r[0] === "Storey Geometry")).toBe(false);
    expect(data.estimate!.simpleRows!.map((r) => r[0])).toEqual([
      "Concrete Volume",
      "Total Rebar Weight",
      "Steel / Concrete",
    ]);
    expect(data.figures.find((f) => f.title === "Storey Geometry")?.completeOnly).toBe(true);

    await generateCalculationPdf(data, { type: "simple", paper: "A4", nolaLogo: png });
    const simple = texts.map((t) => t.text).join(" ");
    for (const absent of ["Storey Geometry", "Hook Basis", "Longitudinal / Shear Weight", "Column Section Drawing"])
      expect(simple).not.toContain(absent);
    expect(simple).toContain("Steel / Concrete");
    texts = [];
    await generateCalculationPdf(data, { type: "complete", paper: "A4", nolaLogo: png });
    const complete = texts.map((t) => t.text).join(" ");
    for (const present of ["Storey Geometry", "Hook Basis", "Longitudinal / Shear Weight", "Column Section Drawing"])
      expect(complete).toContain(present);
  });
  it("Column Simple allows three pages; Slab stays at two", async () => {
    const models = reportFixtures();
    for (const m of Object.values(models)) for (const f of m.figures) f.png = png;
    for (let k = 0; k < 14; k++)
      models.column.summary[2]!.rows.push([`Long Remarks ${k}`, "Reviewed Detailing. ".repeat(40)]);
    const column = await generateCalculationPdf(models.column, { type: "simple", paper: "Letter" });
    expect(column.pageCount).toBe(3);
    for (let k = 0; k < 14; k++)
      models.slab.summary[2]!.rows.push([`Long Remarks ${k}`, "Reviewed Detailing. ".repeat(40)]);
    const error = await generateCalculationPdf(models.slab, { type: "simple", paper: "Letter" }).catch((e) => e);
    expect(error).toBeInstanceOf(ReportTooLongError);
    expect(error.message).toContain("Slab Simple Report Exceeds Two Pages");
  });
  it("labels the Column option 'Up To Three Pages'", () => {
    const html = (moduleName: "RC Column" | "Slab Design") =>
      renderToStaticMarkup(
        createElement(ReportExportControls, {
          moduleName,
          disabled: false,
          onData: async () => reportFixtures().column,
        }),
      );
    expect(html("RC Column")).toContain("Simple Report — Up To Three Pages");
    expect(html("Slab Design")).toContain("Simple Report — Up To Two Pages");
  });
});
