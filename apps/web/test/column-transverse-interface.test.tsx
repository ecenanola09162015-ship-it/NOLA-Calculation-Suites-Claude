import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import {
  analyzeRectangularColumn,
  columnDesignChecks,
  columnTransverseChecks,
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
  confinementReviewChecks,
  shearReviewChecks,
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
      remarks: {},
      onRemarksChange: () => {},
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
    expect(sum).toContain("07 · Design Summary &amp; Adopted Transverse Design");
    expect(sum).toContain("set (or overridden) in panels 05 and 06");
    expect(sum).toContain(`${design.adopted.lo} mm @ ${design.adopted.sEnd}`);
    expect(sum).toContain("Adopt to estimate");
  });
});

describe("review split: flexure under results, shear / ties in 05 / 06", () => {
  const design = designColumnTransverse(input, tie);
  const props = {
    input,
    value: tie,
    onChange: () => {},
    design,
    error: "",
    policy: defaultDesignCheckPolicy,
    remarks: {},
    onRemarksChange: () => {},
  };
  it("routes every transverse check to exactly one panel", () => {
    const shear = shearReviewChecks(design).map((c) => c.id);
    const conf = confinementReviewChecks(design).map((c) => c.id);
    expect(shear.length).toBeGreaterThan(0);
    expect(conf.length).toBeGreaterThan(0);
    expect(shear.every((id) => id.startsWith("tie:shear"))).toBe(true);
    expect(conf.some((id) => id.startsWith("tie:shear"))).toBe(false);
    expect([...shear, ...conf].sort()).toEqual(
      columnTransverseChecks(design)
        .map((c) => c.id)
        .sort(),
    );
  });
  it("flexure review contains no shear or tie rows", () => {
    const flex = columnDesignChecks(analyzeRectangularColumn(input));
    expect(flex.some((c) => c.id.startsWith("tie:"))).toBe(false);
  });
  it("panels 05 / 06 show their checks with a remarks box for amber rows", () => {
    const shear = renderToStaticMarkup(<ColumnShearPanel {...props} />);
    expect(shear).toContain("Shear Checks");
    expect(shear).toContain(shearReviewChecks(design)[0].label);
    const conf = renderToStaticMarkup(<ColumnConfinementPanel {...props} />);
    expect(conf).toContain("Confinement &amp; Detailing Checks");
    // A policy that puts every finite DCR in the judgment band forces remarks.
    const strict = {
      ...defaultDesignCheckPolicy,
      optimizeBelow: 0.0001,
      passThrough: 0.0002,
      judgmentThrough: 100,
    };
    const amber = renderToStaticMarkup(
      <ColumnShearPanel {...props} policy={strict} />,
    );
    expect(amber).toContain("Engineering Judgment Remarks");
  });
  it("panel 07 summarises the governing DCR per group", () => {
    const sum = renderToStaticMarkup(
      <ColumnTieDesignSummary
        value={tie}
        design={design}
        quantity={defaultColumnQuantity()}
        onAdopt={() => {}}
        policy={defaultDesignCheckPolicy}
        groups={[
          { label: "Flexure & axial", panel: "Results", dcr: 0.812 },
          { label: "Shear", panel: "Panel 05", dcr: 0.5 },
        ]}
      />,
    );
    expect(sum).toContain("Governing DCR");
    expect(sum).toContain("0.812");
    expect(sum).toContain("Panel 05");
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

describe("materials as the single source and report summary", () => {
  it("shows Vux / Vuy and the materials bar and tie fields without shear design", () => {
    const html = renderToStaticMarkup(
      <RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />,
    );
    expect(html).toContain("Vux (kN)");
    expect(html).toContain("Vuy (kN)");
    expect(html).toContain("Longitudinal Bar Diameter");
    expect(html).toContain("Tie steel grade (fyt)");
    expect(html).toContain("from Section &amp; Materials");
    expect(html).not.toContain("position: sticky");
  });
  it("prints one biaxial row (3D) in the summary and a tie section within lo", () => {
    const result = analyzeRectangularColumn(input);
    const design = designColumnTransverse(input, tie);
    const data = columnReportData(
      undefined,
      "C-03",
      input,
      result,
      { ...defaultColumnQuantity(), enabled: false },
      defaultDesignCheckPolicy,
      {},
      tie,
      design,
    );
    const summaryRows = data.summary.flatMap((s) =>
      s.rows.map((r) => String(r[0])),
    );
    expect(summaryRows.some((r) => r.includes("Biaxial 3D"))).toBe(true);
    expect(summaryRows.some((r) => r.includes("Bresler"))).toBe(false);
    expect(data.checks.rows.some((r) => String(r[0]).includes("Bresler"))).toBe(
      true,
    );
    const lo = data.figures.find((f) => f.title === "Tie Section Within lo")!;
    expect(lo.svg).toContain(`Within lo = ${design.adopted.lo} mm`);
  });
});

describe("screen fit and spacing overrides", () => {
  it("edits lo and spacing in panels 05/06 with recommended placeholders", () => {
    const design = designColumnTransverse(input, tie);
    const props = {
      input,
      value: tie,
      onChange: () => {},
      design,
      error: "",
      policy: defaultDesignCheckPolicy,
      remarks: {},
      onRemarksChange: () => {},
    };
    const shear = renderToStaticMarkup(<ColumnShearPanel {...props} />);
    expect(shear).toContain('aria-label="Tie spacing in lo override"');
    expect(shear).toContain(
      `placeholder="${design.recommended.sEnd} (recommended)"`,
    );
    const conf = renderToStaticMarkup(<ColumnConfinementPanel {...props} />);
    expect(conf).toContain('aria-label="Confinement length lo override"');
    expect(conf).toContain('aria-label="Design shear Ve x override"');
    // Overridden value: badge, reset button, and the checks use it.
    const over = { ...tie, override: { ...tie.override, sEnd: 125 } };
    const d2 = designColumnTransverse(input, over);
    const html = renderToStaticMarkup(
      <ColumnShearPanel {...props} value={over} design={d2} />,
    );
    expect(html).toContain('value="125"');
    expect(html).toContain('class="overrideBadge">Override · rec.');
    expect(html).toContain(`Use ${d2.recommended.sEnd}`);
    expect(d2.adopted.sEnd).toBe(125);
  });
  it("prints overrides with the recommended value in the report", () => {
    const over = { ...tie, override: { ...tie.override, sEnd: 125 } };
    const d = designColumnTransverse(input, over);
    const data = columnReportData(
      undefined,
      "C-04",
      input,
      analyzeRectangularColumn(input),
      { ...defaultColumnQuantity(), enabled: false },
      defaultDesignCheckPolicy,
      {},
      over,
      d,
    );
    const ties = data.summary
      .flatMap((s) => s.rows)
      .find((r) => String(r[0]) === "Ties (Design)")!;
    const cell = ties[1];
    expect(typeof cell === "string" ? cell : cell.text).toContain(
      `@ 125 (designer override; recommended ${d.recommended.sEnd})`,
    );
  });
});
