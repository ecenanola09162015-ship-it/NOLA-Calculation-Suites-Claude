/** 3D storey view and N/S/E/W beam inputs (17 Oct 2026). */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import {
  analyzeRectangularColumn,
  defaultColumnQuantity,
  defaultColumnStorey,
  defaultDesignCheckPolicy,
  withStoreySides,
  type RectangularColumnInput,
} from "@nola/calc-core";
import { buildStorey3DModel } from "../src/lib/column-storey-3d-model";
import { RectangularColumnWorkspace } from "../src/components/rectangular-column-workspace";
import { columnReportData } from "../src/lib/reports/data";

const beam = (width: number, depth: number) => ({ beam: true, width, depth });
const storey = withStoreySides(
  { ...defaultColumnStorey(), height: 3500, capital: 100, bottom: 300 },
  { north: beam(300, 600), south: beam(300, 450), east: { beam: false, width: 300, depth: 500 }, west: beam(250, 500) },
  200,
);

describe("3D storey model (metres; x east, y north, z up)", () => {
  it("pieces and dimensions from the storey, hand-checked", () => {
    const m = buildStorey3DModel(storey, { width: 600, depth: 800 });
    const get = (id: string) => m.pieces.find((p) => p.id === id)!;
    expect(get("column").box).toMatchObject({ x0: -0.3, x1: 0.3, y0: -0.4, y1: 0.4, z0: 0.3, z1: 3.5 });
    // Tops aligned: column, beams and slab all at H = 3.5 m.
    for (const id of ["column", "slab", "north", "south", "west"]) expect(get(id).box.z1).toBe(3.5);
    expect(get("north").box).toMatchObject({ x0: -0.15, x1: 0.15, y0: 0.4, z0: 2.9, z1: 3.5 });
    expect(get("west").box).toMatchObject({ y0: -0.125, y1: 0.125, x1: -0.3, z0: 3.0 });
    expect(m.pieces.some((p) => p.id === "east")).toBe(false); // slab only
    expect(get("capital").box.z0).toBeCloseTo(3.2, 9); // 3.5 − 0.2 − 0.1
    expect(get("footing").box.z1).toBeCloseTo(0.3, 9);
    // ℓu,x: 3500 − 450 − 100 − 300 = 2650 → line 0.3 → 2.95 m
    const lx = m.dims.find((d) => d.id === "luX")!;
    expect(lx.label).toBe("ℓu,x 2650");
    expect([lx.z0, lx.z1]).toEqual([0.3, expect.closeTo(2.95, 9)]);
    expect(m.dims.find((d) => d.id === "luY")!.label).toBe("ℓu,y 2900"); // 3500 − 200 − 100 − 300
  });
});

describe("panel and report", () => {
  it("panel 01 asks for N/S/E/W beams and the slab thickness", () => {
    const html = renderToStaticMarkup(<RectangularColumnWorkspace cloudReady={false} onSaved={() => {}} />);
    for (const t of ["Upper slab thickness", "North", "South", "East", "West", "None (slab only)", 'aria-label="North beam width"', "along Y · Mux", "along X · Muy", "Governing depth for ℓu"])
      expect(html).toContain(t);
    expect(html).not.toContain("Beam along X — depth");
  });
  it("report lists the four sides; 3D snapshot replaces the 2D sketch in Complete", () => {
    const input: RectangularColumnInput = {
      code: "ACI 318-19", width: 600, depth: 800, fc: 34.5, fy: 420, es: 200000, cover: 40, tieDiameter: 10,
      bars: [-237.5, 237.5].flatMap((x) => [-337.5, 337.5].map((y) => ({ x, y, diameter: 25 }))),
      loads: [{ id: "U", description: "", pu: 2000, mx: 100, my: 50, included: true }],
      storey,
    };
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const args = [undefined, "C", input, analyzeRectangularColumn(input), defaultColumnQuantity(), defaultDesignCheckPolicy, {}] as const;
    const plain = columnReportData(...args);
    const sec = plain.sections.find((s) => s.title.startsWith("Storey Geometry"))!;
    expect(JSON.stringify(sec.rows)).toContain("N 300×600, S 300×450, E none, W 250×500; slab 200 mm");
    expect(JSON.stringify(sec.rows)).toContain("N/S 450 mm → ℓu,x; E/W 200 mm → ℓu,y");
    expect(plain.figures.some((f) => f.title === "Storey Geometry")).toBe(true);
    const snap = columnReportData(...args, undefined, undefined, png);
    const fig = snap.figures.find((f) => f.title === "Storey 3D View")!;
    expect(fig.png).toBe(png);
    expect(fig.completeOnly).toBe(true);
  });
});

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
describe.skipIf(!CHROME)("3D storey view in a real browser", () => {
  it("renders, switches views, follows a beam change, no side scroll on a phone", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/bundle-entry.tsx", import.meta.url).pathname],
      bundle: true, write: false, format: "esm", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
      alias: { "@": new URL("../src", import.meta.url).pathname },
    });
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="rcWorkspace" style="padding:12px"><div id="root"></div></main></body></html>`);
      await page.addScriptTag({ content: out.outputFiles[0]!.text, type: "module" });
      await page.locator(".storey3dCanvas canvas").waitFor();
      const view = page.locator(".storey3d");
      for (const v of ["Front (X)", "Side (Y)", "Plan", "3D"]) await view.getByRole("button", { name: v, exact: true }).click();
      await page.getByLabel("East support").selectOption("none");
      await page.getByText("E/W 150 mm → ℓu,y").waitFor(); // slab 150 governs E/W
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});
