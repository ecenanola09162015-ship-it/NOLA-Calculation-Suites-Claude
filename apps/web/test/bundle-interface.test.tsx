/** Bundled bars in the column workspace (17 Oct 2026). */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeRectangularColumn,
  bundleBars,
  defaultColumnQuantity,
  defaultColumnTieDesign,
  defaultDesignCheckPolicy,
  designColumnTransverse,
  estimateColumnQuantity,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { perimeterBars } from "../src/components/column-bundle-panel";
import { columnReportData } from "../src/lib/reports/data";

const input: RectangularColumnInput = {
  code: "ACI 318-19",
  width: 600,
  depth: 800,
  fc: 34.5,
  fy: 420,
  es: 200000,
  cover: 40,
  tieDiameter: 10,
  bars: [-237.5, 237.5].flatMap((x) => [-337.5, 0, 337.5].map((y) => ({ x, y, diameter: 25 }))),
  loads: [{ id: "U", description: "", pu: 3000, mx: 400, my: 200, vx: 300, vy: 300, included: true }],
};

describe("bundled bars panel", () => {
  it("renders the controls in panel 02 and the Select / Bundle columns", () => {
    const html = renderToStaticMarkup(<RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />);
    const p2 = html.slice(html.indexOf("02 · Reinforcement"), html.indexOf("03 · Factored"));
    for (const t of ["Bundled Bars", "Bars per bundle", "4 bars (maximum, 25.6.1.1)", "Select corners", "Select all perimeter", "Bundle selected (0)", "Unbundle selected", 'role="button"'])
      expect(p2).toContain(t);
    expect(html).toContain("<th>Select</th>");
    expect(html).toContain("<th>Bundle</th>");
  });
  it("corner / perimeter selection", () => {
    expect(perimeterBars(input.bars, true)).toEqual([0, 2, 3, 5]);
    expect(perimeterBars(input.bars)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("tie design, estimate and report work with bundles", () => {
    const b = { ...input, bars: bundleBars(input, [0, 2, 3, 5], 2).bars };
    const base = defaultColumnTieDesign(b, 2500);
    const tie = { ...base, shear: { enabled: true }, confinement: { ...base.confinement, enabled: true, frame: "SMF" as const } };
    expect(() => designColumnTransverse(b, tie)).not.toThrow();
    expect(estimateColumnQuantity(b, { ...defaultColumnQuantity(10), enabled: true })).toBeTruthy();
    const data = columnReportData(undefined, "C", b, analyzeRectangularColumn(b), defaultColumnQuantity(), defaultDesignCheckPolicy, {});
    expect(JSON.stringify(data.summary)).toContain("bundled: 4 × 2-bar bundles");
    expect(data.limitations.some((l) => l.includes("25.7.2.2"))).toBe(true);
    expect(data.limitations.some((l) => l.includes("25.6.1.7"))).toBe(true);
  });
});

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
describe.skipIf(!CHROME)("bundled bars in a real browser", () => {
  it("click bars in the section, bundle 3, see bundles in the table, fix the tie", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/bundle-entry.tsx", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      alias: { "@": new URL("../src", import.meta.url).pathname },
    });
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: out.outputFiles[0]!.text, type: "module" });
      await page.getByText("Bundled Bars").waitFor();
      // Start from a generated layout (bars exactly at cover + tie + db/2).
      await page.getByText("Generate A Uniform Perimeter Layout").click();
      await page.getByRole("button", { name: "Replace bar layout" }).click();
      const n0 = await page.locator('svg [role="button"]').count();
      // Pick two bars by clicking them in the section picture.
      await page.getByRole("button", { name: "Bar 1", exact: true }).click();
      await page.getByRole("button", { name: "Bar 2", exact: true }).click();
      await page.getByText("Bundle selected (2)").waitFor();
      await page.getByLabel("Bars per bundle").selectOption("3");
      await page.getByRole("button", { name: "Bundle selected (2)" }).click();
      await page.waitForFunction((n) => document.querySelectorAll('svg [role="button"]').length === n + 4, n0);
      expect(await page.getByRole("button", { name: /\(bundle B1\)/ }).count()).toBe(3);
      expect(await page.getByRole("button", { name: /\(bundle B2\)/ }).count()).toBe(3);
      // Tie Ø10 with bundles: warning with a one-click fix (25.7.2.2).
      const fix = page.getByRole("button", { name: /^Use Ø12$/ });
      await fix.waitFor();
      await fix.click();
      await page.waitForFunction(() => !document.body.textContent?.includes("with bundled bars: use at least"));
      // Unbundle restores the original count.
      await page.getByRole("button", { name: "Bar 1 (bundle B1)" }).click();
      await page.getByRole("button", { name: "Unbundle selected" }).click();
      await page.waitForFunction((n) => document.querySelectorAll('svg [role="button"]').length === n + 2, n0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60000);
});
