/**
 * Layout guard: review / check tables must never make the page or their own
 * frame scroll sideways. Worst-case content is rendered with the real
 * stylesheet in headless Chromium at phone, tablet and desktop widths.
 * Wide numeric tables ("All combinations") may scroll inside their own
 * frame, but the page itself must not.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright-core";
import {
  analyzeRectangularColumn,
  analyzeSlab,
  columnDesignChecks,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  defaultSlabInput,
  designColumnTransverse,
  slabDesignChecks,
  type ColumnTieDesignInput,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { DesignReviewPanel } from "../src/components/design-review-panel";
import { StoreyGeometryFields } from "../src/components/column-storey-panel";
import { defaultColumnStorey } from "@nola/calc-core";
import {
  ColumnConfinementPanel,
  ColumnShearPanel,
  ColumnTieDesignSummary,
  confinementReviewChecks,
  shearReviewChecks,
} from "../src/components/column-transverse-panel";

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));

// Worst case: 600 × 800 SMF column, 14 bars, non-weldable Grade 420 (amber
// weldability row), high shear in both directions (biaxial shear row),
// overrides, and long engineering remarks with an unbroken token.
const xs = [-245, -82, 82, 245];
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
    { id: "ULS-1.2D+1.0E+1.0L-LONGLABEL", description: "", pu: 2500, mx: 600, my: 400, vx: 900, vy: 1100, included: true },
    { id: "U2", description: "", pu: 600, mx: 300, my: 250, vx: 700, vy: 800, included: true },
  ],
};
const base = defaultColumnTieDesign(input, 2500);
const tie: ColumnTieDesignInput = {
  ...base,
  shear: { enabled: true },
  confinement: { ...base.confinement, enabled: true, frame: "SMF", sumMnbX: 900, sumMnbY: 700 },
  tie: { ...base.tie, diameter: 16, interiorX: 3, interiorY: 2, midInteriorX: 1, midInteriorY: 0 },
  override: { lo: null, sEnd: 100, sMid: 100, veX: null, veY: null },
};
const policy = defaultDesignCheckPolicy;

function pageHtml(width: number) {
  const result = analyzeRectangularColumn(input);
  const design = designColumnTransverse(input, tie);
  const allIds = [
    ...columnDesignChecks(result),
    ...shearReviewChecks(design),
    ...confinementReviewChecks(design),
  ].map((c) => c.id);
  const remarks = Object.fromEntries(
    allIds.map((id) => [
      id,
      "Reviewed with mill certificates; actual fy and tensile/yield ratio confirmed per 20.2.2.5(b). Ref: " +
        "MILLCERT-2026-10-13-PNS49-GRADE420-HEAT-NO-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6".repeat(2),
    ]),
  );
  const props = {
    input,
    value: tie,
    onChange: () => {},
    design,
    error: "",
    policy,
    remarks,
    onRemarksChange: () => {},
  };
  const slabInput = defaultSlabInput();
  const slab = analyzeSlab(slabInput, false);
  const body = renderToStaticMarkup(
    <div className="rcWorkspace">
      <section className="rcPanel">
        <StoreyGeometryFields
          input={{ ...input, storey: { ...defaultColumnStorey(), capital: 150, bottom: 100, luOverrideX: 2600 } }}
          onChange={() => {}}
        />
      </section>
      <section className="rcPanel rcResults">
        <DesignReviewPanel
          title="Flexure & Axial Review"
          checks={columnDesignChecks(result)}
          policy={policy}
          remarks={remarks}
          onChange={() => {}}
        />
      </section>
      <ColumnShearPanel {...props} />
      <ColumnConfinementPanel {...props} />
      <ColumnTieDesignSummary
        value={tie}
        design={design}
        quantity={defaultColumnQuantity()}
        onAdopt={() => {}}
        policy={policy}
        groups={[
          { label: "Flexure & axial", panel: "Results", dcr: 0.9 },
          { label: "Shear", panel: "Panel 05", dcr: 1.2 },
          { label: "Confinement & detailing", panel: "Panel 06", dcr: 1.05 },
        ]}
      />
      <section className="rcPanel">
        <DesignReviewPanel
          checks={slabDesignChecks(slabInput, slab)}
          policy={policy}
          remarks={{}}
          onChange={() => {}}
        />
      </section>
    </div>,
  );
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><style>${css}</style></head><body style="margin:0;padding:0 16px">${body}</body></html>`;
}

let browser: Browser | undefined;
beforeAll(async () => {
  if (CHROME)
    browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
}, 60000);
afterAll(async () => {
  await browser?.close();
});

describe.skipIf(!CHROME)("no sideways scrolling in review and check tables", () => {
  it.each([375, 768, 1280, 1440])(
    "%i px wide",
    async (width) => {
      const page = await browser!.newPage({ viewport: { width, height: 900 } });
      await page.setContent(pageHtml(width), { waitUntil: "domcontentloaded" });
      const report = await page.evaluate(() => {
        const doc = document.documentElement;
        const problems: string[] = [];
        if (doc.scrollWidth > doc.clientWidth + 1)
          problems.push(`page ${doc.scrollWidth} > ${doc.clientWidth}`);
        document.querySelectorAll(".reviewTableWrap").forEach((w, i) => {
          if (w.scrollWidth > w.clientWidth + 1)
            problems.push(`review table ${i}: ${w.scrollWidth} > ${w.clientWidth}`);
        });
        document
          .querySelectorAll(".reviewTable th, .reviewTable td")
          .forEach((c) => {
            const el = c as HTMLElement;
            if (el.offsetParent && el.scrollWidth > el.clientWidth + 1)
              problems.push(
                `cell overflow "${(el.textContent ?? "").slice(0, 40)}": ${el.scrollWidth} > ${el.clientWidth}`,
              );
          });
        // Every panel stays within the viewport.
        document.querySelectorAll(".rcPanel, .designReviewPanel").forEach((p) => {
          const r = p.getBoundingClientRect();
          if (r.right > doc.clientWidth + 1)
            problems.push(`panel right edge ${Math.round(r.right)} > ${doc.clientWidth}`);
        });
        return {
          problems,
          tables: document.querySelectorAll(".reviewTable").length,
          details: document.querySelectorAll(".reviewDetail").length,
        };
      });
      await page.close();
      expect(report.tables).toBeGreaterThanOrEqual(4);
      expect(report.details).toBeGreaterThan(10);
      expect(report.problems).toEqual([]);
    },
    60000,
  );
});

describe("long check explanations are split into short lines", () => {
  it("biaxial shear and weldability rows use 3 lines", () => {
    const d = designColumnTransverse(input, tie);
    const biaxial = d.checks.find((c) => c.id === "shear:biaxial")!;
    expect(biaxial.detail.split("\n")).toHaveLength(3);
    expect(biaxial.detail.split("\n")[1]).toMatch(/^DCR = Σ\/1\.5 = /);
    const grade = d.checks.find((c) => c.id === "smf:grade")!;
    expect(grade.detail.split("\n")).toHaveLength(3);
    expect(grade.detail.split("\n")[2]).toBe(
      "Record the basis in remarks, or select a weldable grade.",
    );
    for (const c of d.checks)
      for (const line of c.detail.split("\n"))
        expect(line.length).toBeLessThanOrEqual(140);
  });
});
