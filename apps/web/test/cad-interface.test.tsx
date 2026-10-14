import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultDesignCheckPolicy,
  designColumnTransverse,
} from "@nola/calc-core";
import { ColumnSectionDrawingButton } from "../src/components/column-section-drawing-button";
import { ColumnQuantityPanel } from "../src/components/column-quantity-panel";
import { ColumnTieDesignSummary } from "../src/components/column-transverse-panel";
import { columnReportData } from "../src/lib/reports/data";
import { input, tie } from "./browser/cad-fixture";

const design = designColumnTransverse(input, tie);
const button = (
  <ColumnSectionDrawingButton input={input} tie={tie} design={design} hookBasis="aci135" title="C-01A" projectName="Ayala Tower" />
);

describe("Drawing Section button", () => {
  it("appears in panel 07 and in the estimate", () => {
    const p7 = renderToStaticMarkup(
      <ColumnTieDesignSummary value={tie} design={design} quantity={defaultColumnQuantity()} onAdopt={() => {}} drawingAction={button} />,
    );
    expect(p7).toContain(">Drawing Section</button>");
    const est = renderToStaticMarkup(
      <ColumnQuantityPanel section={input} value={defaultColumnQuantity()} onChange={() => {}} drawingAction={button} />,
    );
    expect(est).toContain(">Drawing Section</button>");
  });
  it("Complete report carries the section drawing; Simple does not", () => {
    const data = columnReportData(undefined, "C-01A", input, analyzeRectangularColumn(input), defaultColumnQuantity(), defaultDesignCheckPolicy, {}, tie, design);
    expect(data.figures.map((f) => f.title)).not.toContain("Column Section Drawing");
    const fig = data.completeFigures!.find((f) => f.title === "Column Section Drawing")!;
    expect(fig.svg).toContain("SECTION AT Lo");
    expect(fig.svg).toMatch(/width="900" height="\d+"/);
  });
});

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
describe.skipIf(!CHROME)("Drawing Section in a real browser", () => {
  it("previews, then downloads YYMMDD_ABC_<mark>_Section.dxf", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/cad-entry.tsx", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "esm",
      splitting: false,
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: out.outputFiles[0]!.text, type: "module" });
      await page.getByRole("button", { name: "Drawing Section" }).click();
      await page.waitForSelector(".sectionDrawingSvg svg");
      expect(await page.locator(".sectionDrawingSvg").textContent()).toContain("SECTION AT Lc");
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download DXF" }).click(),
      ]);
      expect(dl.suggestedFilename()).toMatch(/^\d{6}_AYA_C-01A_Section\.dxf$/);
      const path = await dl.path();
      const text = readFileSync(path!, "utf8");
      expect(text).toContain("AC1021");
      expect(text).toContain("SECTION AT Lo");
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});
