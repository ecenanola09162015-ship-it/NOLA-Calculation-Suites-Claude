import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnSlenderness,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  designColumnTransverse,
  type ColumnTieDesignInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  ColumnConfinementPanel,
  ColumnShearPanel,
  ColumnTieDesignSummary,
} from "../src/components/column-transverse-panel";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { columnReportData } from "../src/lib/reports/data";
import { generateCalculationPdf } from "../src/lib/reports/pdf";

const face = [-187.5, -62.5, 62.5, 187.5];
const input: RectangularColumnInput = {
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
      vx: 40,
      vy: 120,
      included: true,
    },
    {
      id: "U2",
      description: "",
      pu: 600,
      mx: 180,
      my: 60,
      vx: 70,
      vy: 150,
      included: true,
    },
  ],
  slenderness: { ...defaultColumnSlenderness(3000), enabled: true },
};
const base = defaultColumnTieDesign(input, 3000);
const tie: ColumnTieDesignInput = {
  ...base,
  shear: { enabled: true },
  confinement: { ...base.confinement, enabled: true, frame: "SMF" },
  tie: { ...base.tie, interiorX: 2, interiorY: 2 },
};

describe("shear and confinement panels", () => {
  it("are not shown before Calculate section, like the estimate", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).not.toContain("05 · Shear Design");
    expect(html).not.toContain("06 · Seismic Confinement Design");
  });
  it("render results, figures, overrides and the adopt button", () => {
    const design = designColumnTransverse(input, tie);
    const props = {
      input,
      value: tie,
      onChange: () => {},
      design,
      error: "",
      policy: defaultDesignCheckPolicy,
    };
    const shear = renderToStaticMarkup(<ColumnShearPanel {...props} />);
    expect(shear).toContain("05 · Shear Design");
    expect(shear).toContain("Vuy (along y) · pairs with Mux");
    expect(shear).toContain("Orange: legs resisting");
    const conf = renderToStaticMarkup(<ColumnConfinementPanel {...props} />);
    expect(conf).toContain("06 · Seismic Confinement Design");
    expect(conf).toContain("Adopted Confinement Zones");
    expect(conf).toContain(`lo = ${design.adopted.lo}`);
    expect(conf).toContain("Table 18.7.5.4");
    const sum = renderToStaticMarkup(
      <ColumnTieDesignSummary
        value={tie}
        onChange={() => {}}
        design={design}
        quantity={defaultColumnQuantity()}
        onAdopt={() => {}}
      />,
    );
    expect(sum).toContain("07 · Adopted Transverse Design");
    expect(sum).toContain(`recommended ${design.recommended.sEnd}`);
    expect(sum).toContain("Adopt to estimate");
  });
});

describe("column simple report with design add-ons", () => {
  it.each(["A4", "Letter"] as const)("fits two pages on %s", async (paper) => {
    const result = analyzeRectangularColumn(input);
    const design = designColumnTransverse(input, tie);
    const q = { ...defaultColumnQuantity(), enabled: true };
    const data = columnReportData(
      undefined,
      "C-02",
      input,
      result,
      q,
      defaultDesignCheckPolicy,
      {},
      tie,
      design,
    );
    expect(data.simplePageLimit).toBe(2);
    expect(data.figures.map((f) => f.title)).toContain(
      "Confinement Zones (Clear Height)",
    );
    expect(data.sections.map((s) => s.title)).toContain("Shear By Combination");
    expect(
      data.checks.rows.some((r) => String(r[1]).includes("18.7.5.4")),
    ).toBe(true);
    for (const f of data.figures)
      f.png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const pdf = await generateCalculationPdf(data, { type: "simple", paper });
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBeLessThanOrEqual(2);
  });
});
