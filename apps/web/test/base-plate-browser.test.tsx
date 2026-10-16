import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const CHROME = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p): p is string => !!p && existsSync(p));
const shots = process.env.BP_SCREENSHOTS;

describe.skipIf(!CHROME)("base plate workspace in a real browser", () => {
  it("picks a shape, switches anchor type, draws 2D and 3D without errors", async () => {
    const out = await build({
      entryPoints: [
        new URL("./browser/base-plate-entry.tsx", import.meta.url).pathname,
      ],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": new URL("../src", import.meta.url).pathname },
      logLevel: "silent",
    });
    const js = out.outputFiles[0]!.text;
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      );
      await page.addScriptTag({ content: js });
      await page.waitForSelector(".bpDrawing svg");
      if (shots)
        await page.screenshot({
          path: `${shots}/bp-layout.png`,
          fullPage: true,
        });
      await page.getByRole("button", { name: "Blueprint (screen only)" }).click();
      if (shots) await page.screenshot({ path: `${shots}/bp-blueprint.png`, fullPage: true });
      await page.getByRole("button", { name: "Engineering", exact: true }).click();
      // Shape picker: type-ahead and keyboard selection.
      const box = page.getByRole("combobox", { name: "Column shape" });
      await box.fill("hss8x8");
      await page.waitForSelector('[role="option"]');
      expect(
        await page.locator('[role="option"]').first().textContent(),
      ).toContain("HSS8X8");
      if (shots) await page.screenshot({ path: `${shots}/bp-picker.png` });
      await box.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector(".bpDrawing")?.textContent?.includes("HSS8X8"),
      );
      // Custom section: type → dimensions.
      await page.getByRole("radio", { name: "Custom section" }).click();
      await page.getByLabel("Section type").selectOption("tube");
      await page.getByLabel("Outside diameter OD").fill("273");
      await page.getByLabel("Wall thickness t").fill("9.3");
      await page.waitForFunction(() =>
        document
          .querySelector(".bpDrawing")
          ?.textContent?.includes("TUBE 273×9.3"),
      );
      if (shots)
        await page.screenshot({
          path: `${shots}/bp-custom.png`,
          fullPage: true,
        });
      await page.getByRole("radio", { name: "AISC database" }).click();
      await page.waitForFunction(() =>
        document.querySelector(".bpDrawing")?.textContent?.includes("HSS8X8"),
      );
      // ASD method.
      await page.getByLabel("Steel Design Method").selectOption("ASD");
      expect(
        await page.getByText("Load Combinations (service, ASD)").count(),
      ).toBe(1);
      await page.getByLabel("Steel Design Method").selectOption("LRFD");
      // Anchor type and specification dropdowns.
      await page.getByLabel("Anchor type").selectOption("adhesive");
      expect(await page.getByText("Post-installed product").count()).toBe(1);
      await page.getByLabel("Specification").selectOption("A193-B7");
      expect(await page.locator(".bpStrength").textContent()).toContain(
        "Fy 723.9",
      );
      // 3D tab.
      await page.getByRole("tab", { name: "3D view with loads" }).click();
      await page.waitForSelector(".slab3dCanvas canvas", { timeout: 20000 });
      await page.waitForTimeout(500);
      const painted = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>(
          ".slab3dCanvas canvas",
        )!;
        const g = document.createElement("canvas");
        g.width = c.width;
        g.height = c.height;
        const ctx = g.getContext("2d")!;
        ctx.drawImage(c, 0, 0);
        const d = ctx.getImageData(0, 0, g.width, g.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 101)
          if (Math.abs(d[i]! - 247) > 12) n++;
        return n;
      });
      expect(painted).toBeGreaterThan(50);
      for (const v of [
        "Plan",
        "Front (along Y)",
        "Side (along X)",
        "Isometric",
      ])
        await page.getByRole("button", { name: v, exact: true }).click();
      await page.getByLabel("See-through concrete").check();
      if (shots)
        await page.screenshot({ path: `${shots}/bp-3d.png`, fullPage: true });
      await page.getByRole("button", { name: "Add 3D view to report" }).click();
      expect(
        await page.getByText("A 3D snapshot will be included").count(),
      ).toBe(1);
      await page.getByRole("tab", { name: "Calculations & loads" }).click();
      expect(await page.getByText("Step-by-Step").count()).toBe(1);
      await page.getByRole("button", { name: /Suggest anchor rods/ }).click();
      await page.waitForFunction(() =>
        /best trial|Smallest passing/.test(document.body.textContent ?? ""),
      );
      if (shots)
        await page.screenshot({
          path: `${shots}/bp-calcs.png`,
          fullPage: true,
        });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 120000);
});
