import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnSlenderness,
  defaultColumnStorey,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  designColumnTransverse,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { ColumnSlendernessInputs } from "../src/components/column-slenderness-panel";
import { ColumnQuantityPanel } from "../src/components/column-quantity-panel";
import { ColumnConfinementPanel } from "../src/components/column-transverse-panel";
import { columnReportData } from "../src/lib/reports/data";
import { generateCalculationPdf } from "../src/lib/reports/pdf";

const storey = { ...defaultColumnStorey(), height: 3500, beamX: 600, beamY: 500 };
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-245, -82, 82, 245].flatMap((x) => [-345, 345].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U1", description: "", pu: 2000, mx: 200, my: 150, vx: 400, vy: 400, included: true }],
  slenderness: { ...defaultColumnSlenderness(3000), enabled: true },
  storey,
};

describe("storey geometry in the column workspace", () => {
  it("panel 01 asks for H and the two beam depths and shows ℓu", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).toContain("Storey Geometry");
    expect(html).toContain("Floor-to-floor height H");
    expect(html).toContain("Beam along X — depth (braces Muy)");
    expect(html).toContain("Beam along Y — depth (braces Mux)");
    expect(html).toContain("Drop panel / capital / haunch");
    expect(html).toContain("ℓu,x (Mux) = 2,500 mm");
  });
  it("slenderness ℓu comes from storey with an override field", () => {
    const html = renderToStaticMarkup(
      <ColumnSlendernessInputs input={input} onChange={() => {}} />,
    );
    expect(html).toContain('placeholder="3,000 (storey geometry)"');
    expect(html).toContain('placeholder="2,900 (storey geometry)"');
    const over = renderToStaticMarkup(
      <ColumnSlendernessInputs
        input={{ ...input, storey: { ...storey, luOverrideX: 2000 } }}
        onChange={() => {}}
      />,
    );
    expect(over).toContain("Override · storey 3,000");
  });
  it("estimate follows storey geometry until overridden", () => {
    const q = { ...defaultColumnQuantity(10), enabled: true, height: 3500, beamDepth: 600 };
    const linked = renderToStaticMarkup(
      <ColumnQuantityPanel section={input} value={q} onChange={() => {}} />,
    );
    expect(linked).toContain("From Storey Geometry");
    expect(linked).toContain("Override for the estimate");
    const over = renderToStaticMarkup(
      <ColumnQuantityPanel section={input} value={{ ...q, geometryOverride: true }} onChange={() => {}} />,
    );
    expect(over).toContain("Estimate override: storey geometry gives H");
  });
  it("panel 06 shows lo and Ve clear heights from storey", () => {
    const base = defaultColumnTieDesign(input, 2500);
    const tie = { ...base, confinement: { ...base.confinement, enabled: true, frame: "SMF" as const } };
    const html = renderToStaticMarkup(
      <ColumnConfinementPanel
        input={input}
        value={tie}
        onChange={() => {}}
        design={designColumnTransverse(input, tie)}
        error=""
        policy={defaultDesignCheckPolicy}
        remarks={{}}
        onRemarksChange={() => {}}
      />,
    );
    expect(html).toContain("lo uses 3000 mm; Ve x / y use 2900 / 3000 mm");
    expect(html).toContain("Enter ℓu manually (override)");
  });
  it("an old draft reopens with its typed ℓu kept as an override", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace
        cloudReady={false}
        onSaved={() => {}}
        draft={{
          id: "d",
          projectId: "p",
          moduleSlug: "rc-column",
          title: "Old",
          verificationStatus: "verification-required",
          updatedAt: "2026-10-01",
          payload: {
            kind: "rc-column",
            version: 1,
            scopeConfirmed: true,
            input: { ...input, storey: undefined, slenderness: { ...defaultColumnSlenderness(2800), enabled: true } },
            quantity: { ...defaultColumnQuantity(10), height: 3200, beamDepth: 450 },
          },
        }}
      />,
    );
    expect(html).toContain("Override · storey 2,750");
    expect(html).toContain('value="3200"');
  });
  it("report prints storey geometry (summary row, section, figure) and fits", async () => {
    const t = designColumnTransverse(input, {
      ...defaultColumnTieDesign(input, 2500),
      shear: { enabled: true },
    });
    const data = columnReportData(
      undefined,
      "C-1",
      input,
      analyzeRectangularColumn(input),
      defaultColumnQuantity(),
      defaultDesignCheckPolicy,
      {},
      { ...defaultColumnTieDesign(input, 2500), shear: { enabled: true } },
      t,
    );
    const row = data.summary.flatMap((s) => s.rows).find((r) => r[0] === "Storey Geometry")!;
    expect(String(row[1])).toContain("ℓu,x 3000 / ℓu,y 2900 mm; joint 600 mm");
    expect(data.sections.some((s) => s.title.startsWith("Storey Geometry"))).toBe(true);
    expect(data.figures.map((f) => f.title)).toContain("Storey Geometry");
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    for (const f of data.figures) f.png = png;
    const pdf = await generateCalculationPdf(data, { type: "simple", paper: "A4" });
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeLessThanOrEqual(2);
  });
});
