import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const CHROME = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(
  (p): p is string => !!p && existsSync(p),
);

describe.skipIf(!CHROME)("underground tank 3D view in a real browser", () => {
  it("paints the tank, switches views and toggles, and takes a snapshot", async () => {
    const out = await build({
      entryPoints: [new URL("./browser/tank3d-entry.tsx", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": new URL("../src", import.meta.url).pathname },
      logLevel: "silent",
    });
    const js = out.outputFiles[0]!.text;
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: js });
      await page.waitForSelector(".slab3dCanvas canvas", { timeout: 20000 });
      const painted = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>(".slab3dCanvas canvas")!;
        const g = document.createElement("canvas");
        g.width = c.width;
        g.height = c.height;
        const ctx = g.getContext("2d")!;
        ctx.drawImage(c, 0, 0);
        const d = ctx.getImageData(0, 0, g.width, g.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 97) if (d[i]! < 200) n++;
        return n;
      });
      expect(painted).toBeGreaterThan(200);
      for (const label of ["Section", "Plan", "Isometric"]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        expect(await page.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed")).toBe("true");
      }
      await page.getByLabel("Roof").uncheck();
      await page.getByLabel("Roof").check();
      await page.getByRole("button", { name: "Add 3D view to report" }).click();
      expect(await page.evaluate(() => (window as unknown as { snap?: string }).snap?.startsWith("data:image/png"))).toBe(true);
      if (process.env.TANK_SHOT) await page.screenshot({ path: process.env.TANK_SHOT, fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90000);
});
