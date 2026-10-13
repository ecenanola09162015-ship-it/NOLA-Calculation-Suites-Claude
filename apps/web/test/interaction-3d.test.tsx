/**
 * 3D interaction surface: geometry checks (pure) and a real-browser run in
 * headless Chromium (WebGL via SwiftShader): the card renders, draws pixels,
 * view buttons and toggles work, and no console errors occur.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeRectangularColumn,
  biaxialContour,
  biaxialSection,
  defaultDesignCheckPolicy,
  type RectangularColumnInput,
} from "@nola/calc-core";
import {
  buildInteraction3D,
  cameraFor,
  sliceAt,
  surfaceMesh,
  toScene,
} from "../src/lib/interaction-3d-model";

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
  loads: [
    { id: "LC1", description: "", pu: 2400, mx: 150, my: 80, included: true },
    { id: "LC2", description: "", pu: 3200, mx: 600, my: 300, included: true },
  ],
};

describe("3D interaction model", () => {
  const result = analyzeRectangularColumn(input);
  const m = buildInteraction3D(input, result, defaultDesignCheckPolicy);
  it("mesh covers the θ × c grid and fits the ±1 box", () => {
    const mesh = surfaceMesh(m.surface.design, m.scale);
    expect(mesh.triangles).toBe(72 * 29 * 2);
    for (const v of mesh.positions) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it("Mx–My slice at the governing Pu matches the engine contour within 2%", () => {
    const pu = m.governingPu;
    const slice = sliceAt(m.surface.design, pu);
    const engine = biaxialContour(biaxialSection(input), pu, 72);
    const rS = Math.max(...slice.map(([x, y]) => Math.hypot(x, y)));
    const rE = Math.max(...engine.map((p) => Math.hypot(p.mx, p.my)));
    expect(Math.abs(rS - rE) / rE).toBeLessThan(0.02);
  });
  it("demand points carry the 3D DCR and the capacity ray", () => {
    const g = m.points.find((p) => p.governing)!;
    const c = result.checks.find((c) => c.load.id === g.id)!;
    expect(g.capacity!.mx).toBeCloseTo(c.biaxial!.mx, 9);
    expect(g.dcr).toBeCloseTo(Math.max(c.axialRatio, c.biaxialRatio ?? 0), 9);
    expect(toScene(m.scale, 0, 0, m.scale.pMax)[1]).toBeCloseTo(1, 9);
  });
  it("views: P–Mx front, P–My side, Mx–My plan", () => {
    expect(cameraFor("pmx").position).toEqual([0, 0, 6]);
    expect(cameraFor("pmy").position).toEqual([-6, 0, 0]);
    expect(cameraFor("mxmy")).toEqual({ position: [0, -6, 0], up: [0, 0, 1] });
  });
});

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));

describe.skipIf(!CHROME)("3D card in a real browser", () => {
  it("renders, responds to views and toggles, without errors", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/i3d-entry.tsx", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    const js = out.outputFiles[0]!.text;
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: js });
      await page.waitForSelector(".i3dCanvas canvas", { timeout: 20000 });
      await page.waitForFunction(() => !document.querySelector(".i3dNote"), null, { timeout: 20000 });
      const painted = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>(".i3dCanvas canvas")!;
        const g = document.createElement("canvas");
        g.width = c.width;
        g.height = c.height;
        const ctx = g.getContext("2d")!;
        ctx.drawImage(c, 0, 0);
        const d = ctx.getImageData(0, 0, g.width, g.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i]! > 0) n++;
        return n;
      });
      expect(painted).toBeGreaterThan(50);
      for (const label of ["P–Mx", "P–My", "Mx–My", "3D"]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        expect(await page.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed")).toBe("true");
      }
      await page.getByRole("button", { name: "Mx–My", exact: true }).click();
      expect(await page.getByText(/P level/).count()).toBe(1);
      await page.getByLabel("Nominal surface").uncheck();
      await page.getByLabel("Wireframe").check();
      await page.getByLabel("Combination").selectOption("LC1");
      await page.screenshot({ path: "/tmp/claude-0/-home-claude-nola-calculation-suites-claude/238b235a-8bb7-5535-afde-b0ae087b68e7/scratchpad/i3d.png" }).catch(() => {});
      expect(await page.locator(".i3dReadout").textContent()).toContain("LC1");
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});

describe("3D surface in the PDF report", () => {
  it("is a Complete-report figure only", async () => {
    const { columnReportData } = await import("../src/lib/reports/data");
    const { generateCalculationPdf } = await import("../src/lib/reports/pdf");
    const { defaultColumnQuantity } = await import("@nola/calc-core");
    const result = analyzeRectangularColumn(input);
    const data = columnReportData(undefined, "C-3D", input, result, defaultColumnQuantity(), defaultDesignCheckPolicy, {});
    expect(data.figures.map((f) => f.title)).not.toContain("3D Interaction Surface (P-Mx-My)");
    const fig = data.completeFigures!.find((f) => f.title === "3D Interaction Surface (P-Mx-My)")!;
    expect(fig.svg).toContain("<circle");
    expect(fig.svg.match(/<path/g)!.length).toBeGreaterThan(20);
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    for (const f of [...data.figures, ...data.completeFigures!]) f.png = png;
    const simple = await generateCalculationPdf(data, { type: "simple", paper: "A4" });
    const complete = await generateCalculationPdf(data, { type: "complete", paper: "A4" });
    expect(simple.warnings).toEqual([]);
    expect(complete.warnings).toEqual([]);
    expect(complete.pageCount).toBeGreaterThan(simple.pageCount - 1);
  });
});
