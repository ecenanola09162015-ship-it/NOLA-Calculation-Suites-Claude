import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
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
  crossTieError,
} from "../src/components/column-transverse-panel";
import { columnReportData } from "../src/lib/reports/data";
import { OVERRIDE_COLOR } from "../src/lib/override-style";

// 600 × 800 with 4 bars per short face and 5 per long face (14 bars).
const xs = [-245, -82, 82, 245];
const ys = [-345, -172.5, 0, 172.5, 345];
const bars = [
  ...xs.flatMap((x) => [-345, 345].map((y) => ({ x, y, diameter: 25 }))),
  ...[-172.5, 0, 172.5].flatMap((y) =>
    [-245, 245].map((x) => ({ x, y, diameter: 25 })),
  ),
];
const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 28,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 16,
  bars,
  loads: [
    { id: "U1", description: "", pu: 2500, mx: 300, my: 150, vx: 250, vy: 350, included: true },
  ],
  slenderness: defaultColumnSlenderness(2500),
};
const base = defaultColumnTieDesign(input, 2500);
const tie: ColumnTieDesignInput = {
  ...base,
  shear: { enabled: true },
  confinement: { ...base.confinement, enabled: true, frame: "SMF" },
  tie: { ...base.tie, diameter: 16, interiorX: 3, interiorY: 2 },
};
const props = (t: ColumnTieDesignInput) => ({
  input,
  value: t,
  onChange: () => {},
  design: designColumnTransverse(input, t),
  error: "",
  policy: defaultDesignCheckPolicy,
  remarks: {},
  onRemarksChange: () => {},
});

describe("cross-tie inputs sit with the shear they resist", () => {
  it("Vux card holds the ∥ X count, Vuy card the ∥ Y count, in that order", () => {
    const html = renderToStaticMarkup(<ColumnShearPanel {...props(tie)} />);
    const vux = html.indexOf("Vux (along x) · pairs with Muy");
    const vuy = html.indexOf("Vuy (along y) · pairs with Mux");
    const fx = html.indexOf("Interior cross-ties ∥ X — resist Vux");
    const fy = html.indexOf("Interior cross-ties ∥ Y — resist Vuy");
    expect(vux).toBeGreaterThan(-1);
    expect(vux).toBeLessThan(fx);
    expect(fx).toBeLessThan(vuy);
    expect(vuy).toBeLessThan(fy);
    const d = designColumnTransverse(input, tie);
    expect(html).toContain(`→ ${d.layout.legsX} legs ∥ X (2 hoop + 3 cross-ties)`);
    expect(html).toContain(`→ ${d.layout.legsY} legs ∥ Y (2 hoop + 2 cross-ties)`);
    expect(html).toMatch(/min="0"[^>]*max="3"[^>]*step="1"/);
  });
  it("changing ∥ X changes only the Vux drawing's legs", () => {
    const a = designColumnTransverse(input, tie);
    const b = designColumnTransverse(input, {
      ...tie,
      tie: { ...tie.tie, interiorX: 1 },
    });
    expect(b.sections.x.legs).toBe(a.sections.x.legs - 2);
    expect(b.sections.y.legs).toBe(a.sections.y.legs);
  });
  it("rejects negative, fractional and over-cap counts", () => {
    expect(crossTieError("-1", 3)).toContain("negative");
    expect(crossTieError("1.5", 3)).toContain("whole number");
    expect(crossTieError("", 3)).toContain("whole number");
    expect(crossTieError("4", 3)).toContain("Only 3 interior bar pairs");
    expect(crossTieError("3", 3)).toBe("");
    expect(crossTieError("0", 3)).toBe("");
  });
});

describe("separate arrangement outside lo", () => {
  const mid: ColumnTieDesignInput = {
    ...tie,
    tie: { ...tie.tie, midInteriorX: 1, midInteriorY: 0 },
  };
  it("panel 06 offers it and draws a second section", () => {
    const off = renderToStaticMarkup(<ColumnConfinementPanel {...props(tie)} />);
    expect(off).toContain("Different tie arrangement outside lo (18.7.5.5)");
    expect(off).not.toContain("Section outside lo");
    const on = renderToStaticMarkup(<ColumnConfinementPanel {...props(mid)} />);
    expect(on).toContain("Outside lo: cross-ties ∥ X — resist Vux");
    expect(on).toContain("Section outside lo · 3 legs ∥ X, 2 legs ∥ Y");
  });
  it("report prints both arrangements", () => {
    const t = designColumnTransverse(input, mid);
    const data = columnReportData(
      undefined,
      "C-1",
      input,
      analyzeRectangularColumn(input),
      defaultColumnQuantity(),
      defaultDesignCheckPolicy,
      {},
      mid,
      t,
    );
    expect(data.figures.map((f) => f.title)).toContain("Tie Section Outside lo");
    const row = data.summary.flatMap((s) => s.rows).find((r) => r[0] === "Ties (Design)")!;
    expect(JSON.stringify(row)).toContain("3 x 2 outside lo");
  });
});

describe("overrides are shown in violet", () => {
  const over: ColumnTieDesignInput = {
    ...tie,
    override: { ...tie.override, sMid: 100 },
  };
  it("elevation label, inputs, cards and panel 07", () => {
    const d = designColumnTransverse(input, over);
    const conf = renderToStaticMarkup(<ColumnConfinementPanel {...props(over)} />);
    expect(conf).toContain(`fill="${OVERRIDE_COLOR}"`);
    expect(conf).toContain(`override (recommended ${d.recommended.sMid})`);
    expect(conf).toContain('class="isOverride"');
    expect(conf).toContain("Active designer overrides:");
    expect(conf).toContain("Violet = designer override");
    // Shared: panel 05 also reports the override set for panel 06.
    const shear = renderToStaticMarkup(<ColumnShearPanel {...props(over)} />);
    expect(shear).toContain("Active designer overrides:");
    const sum = renderToStaticMarkup(
      <ColumnTieDesignSummary
        value={over}
        design={d}
        quantity={defaultColumnQuantity()}
        onAdopt={() => {}}
      />,
    );
    expect(sum).toContain(`override · recommended ${d.recommended.sMid}`);
  });
  it("PDF summary and elevation figure use the override colour", () => {
    const t = designColumnTransverse(input, over);
    const data = columnReportData(
      undefined,
      "C-1",
      input,
      analyzeRectangularColumn(input),
      defaultColumnQuantity(),
      defaultDesignCheckPolicy,
      {},
      over,
      t,
    );
    const row = data.summary.flatMap((s) => s.rows).find((r) => r[0] === "Ties (Design)")!;
    expect(row[1]).toMatchObject({ color: OVERRIDE_COLOR });
    const elev = data.figures.find((f) => f.title.startsWith("Confinement Zones"))!;
    expect(elev.svg).toContain(`fill="${OVERRIDE_COLOR}"`);
    expect(elev.svg).toContain("(override)");
  });
});

describe("review tables inside panels 05 / 06 keep their columns", () => {
  it("panel style forces full width and fixed layout for the nested review table", () => {
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const rule = css.slice(css.indexOf(".cqPanel .designReviewPanel table {"));
    expect(rule).toMatch(/width: 100%;[\s\S]*table-layout: fixed;/);
    // The nested rule comes after the panel's auto-width rule, so it wins.
    expect(css.lastIndexOf(".cqPanel .designReviewPanel table {")).toBeGreaterThan(
      css.lastIndexOf(".cqPanel table {"),
    );
    const html = renderToStaticMarkup(<ColumnConfinementPanel {...props(tie)} />);
    for (const h of ["Check", "Code Reference", "DCR", "Status"])
      expect(html).toContain(`<th>${h}</th>`);
  });
});
